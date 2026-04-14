/**
 * FreeLang Nexus - 의존성 그래프 및 빌드 순서 결정
 * 다중언어 블록 간의 의존성을 관리하고 topological sort로 빌드 순서 결정
 */

export interface BuildNode {
  id: string;              // artifact 이름 (예: "rustcore" = librustcore.so에서 lib/so 제거)
  lang: string;            // 언어 (rust, zig, go, julia 등)
  buildCmd: string;        // 빌드 명령
  artifact: string;        // 아티팩트 파일명 (librustcore.so)
  sourceCode?: string;     // 소스 코드
  sourceName?: string;     // 소스 파일명
  cgo?: boolean;          // Go cgo 플래그
  dependsOn: string[];    // 의존하는 artifact id 리스트
}

export class DependencyGraph {
  private nodes: Map<string, BuildNode> = new Map();
  private inDegree: Map<string, number> = new Map();
  private adjacencyList: Map<string, string[]> = new Map();

  /**
   * Reproducible build을 위한 byte-wise 문자열 비교
   * Locale 의존성 제거 (OS 설정과 무관하게 동일한 순서 보장)
   */
  private static compareString(a: string, b: string): number {
    // Byte-wise lexicographic comparison (locale-independent)
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * 노드 추가
   */
  addNode(node: BuildNode): void {
    this.nodes.set(node.id, node);

    if (!this.adjacencyList.has(node.id)) {
      this.adjacencyList.set(node.id, []);
    }

    if (!this.inDegree.has(node.id)) {
      this.inDegree.set(node.id, 0);
    }

    // 의존성 추가
    for (const depId of node.dependsOn) {
      if (!this.adjacencyList.has(depId)) {
        this.adjacencyList.set(depId, []);
      }

      // depId -> node.id의 간선 추가
      if (!this.adjacencyList.get(depId)!.includes(node.id)) {
        this.adjacencyList.get(depId)!.push(node.id);
        this.inDegree.set(node.id, (this.inDegree.get(node.id) || 0) + 1);
      }
    }
  }

  /**
   * Kahn's algorithm: Topological sort (결정적 순서)
   * 의존성 먼저 빌드되도록 순서 결정
   * 순환 의존성 감지 시 오류 반환
   *
   * 결정성 보장:
   * - in-degree 0 노드들을 id 사전순으로 정렬
   * - 인접 리스트도 정렬 후 순회
   * - 큐에 추가되는 노드들도 정렬
   */
  topologicalSort(): BuildNode[] | { error: string } {
    const inDegree = new Map(this.inDegree);
    let queue: string[] = [];

    // in-degree가 0인 노드부터 시작 (사전순 정렬)
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }
    queue.sort((a, b) => DependencyGraph.compareString(a, b));

    const result: BuildNode[] = [];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = this.nodes.get(nodeId);

      if (node) {
        result.push(node);
      }

      // 이웃 노드들을 정렬한 순서로 순회
      const neighbors = (this.adjacencyList.get(nodeId) || []).sort((a, b) => DependencyGraph.compareString(a, b));
      const newZeroDegreeNodes: string[] = [];

      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          newZeroDegreeNodes.push(neighbor);
        }
      }

      // 새로 in-degree 0이 된 노드들을 정렬해서 큐에 추가
      newZeroDegreeNodes.sort((a, b) => DependencyGraph.compareString(a, b));
      queue.push(...newZeroDegreeNodes);
      queue.sort((a, b) => DependencyGraph.compareString(a, b));
    }

    // 모든 노드가 처리되지 않았으면 순환 의존성 있음
    if (result.length !== this.nodes.size) {
      const remaining = Array.from(this.nodes.keys())
        .filter(id => !result.some(n => n.id === id))
        .sort((a, b) => DependencyGraph.compareString(a, b))
        .join(', ');
      return { error: `순환 의존성 감지: ${remaining}` };
    }

    return result;
  }

  /**
   * 병렬 빌드 가능한 레이어 그룹 반환 (결정적 순서)
   * 같은 레이어 = 서로 의존성 없음 = 병렬 빌드 가능
   * 예: [[rust_core, rust_util], [zig_bridge], [driver.jl, main.go]]
   *
   * 결정성 보장:
   * - in-degree 0 노드들을 사전순으로 정렬
   * - 각 그룹 내 노드들도 정렬
   * - 인접 리스트 순회도 정렬 후 처리
   */
  parallelGroups(): BuildNode[][] {
    const groups: BuildNode[][] = [];
    const processed = new Set<string>();
    const inDegree = new Map(this.inDegree);

    while (processed.size < this.nodes.size) {
      const toRemove: string[] = [];

      // 현재 레이어: in-degree 0인 모든 노드 (사전순 정렬)
      const zeroInDegreeIds = Array.from(inDegree.entries())
        .filter(([nodeId, degree]) => degree === 0 && !processed.has(nodeId))
        .map(([nodeId]) => nodeId)
        .sort((a, b) => DependencyGraph.compareString(a, b));

      if (zeroInDegreeIds.length === 0) break; // 진행 불가

      // 그룹 노드들을 정렬 후 추가
      const group = zeroInDegreeIds
        .map(nodeId => this.nodes.get(nodeId))
        .filter(node => node !== undefined) as BuildNode[];
      groups.push(group);

      toRemove.push(...zeroInDegreeIds);

      // 처리된 노드 표시 및 이웃의 in-degree 감소
      for (const nodeId of toRemove) {
        processed.add(nodeId);

        // 인접 노드들을 정렬한 순서로 처리
        const neighbors = (this.adjacencyList.get(nodeId) || []).sort((a, b) => DependencyGraph.compareString(a, b));
        for (const neighbor of neighbors) {
          inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
        }
      }
    }

    return groups;
  }
}
