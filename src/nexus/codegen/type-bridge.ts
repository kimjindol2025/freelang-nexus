/**
 * FreeLang Nexus - Type Bridge Tier System
 *
 * P2: Type Bridge Tier System
 * 다중언어 타입 변환의 안전성을 4가지 Tier로 분류하고, 컴파일 진단에 반영
 */

/**
 * 타입 변환 Tier
 *
 * Tier 1: 안전 직접 매핑 (자동, 경고 없음)
 * Tier 2: 안전 확대 변환 (자동, 암시적)
 * Tier 3: 명시적 변환 필요 (@cast 필수)
 * Tier 4: 금지/미지원 (컴파일 에러)
 */
export type TypeTier = 1 | 2 | 3 | 4;

/**
 * 타입 변환 분류
 */
export interface TypeConversion {
  fromLang: string;     // 출발 언어
  fromType: string;     // 출발 타입 (예: i32, i64)
  toLang: string;       // 도착 언어
  toType: string;       // 도착 타입 (예: int, long long)
  tier: TypeTier;       // Tier 1-4
  suggestion: string;   // 사용자 메시지
}

/**
 * 핵심 타입 매핑 (Rust/V ↔ C)
 *
 * Tier 1: 일대일 안전 매핑
 * - i32 ↔ int
 * - i64 ↔ long long
 * - f32 ↔ float
 * - f64 ↔ double
 * - bool ↔ int (C에서는 int로 표현)
 */
export const TIER_1_MAPPINGS: Record<string, Record<string, string>> = {
  // Rust → C
  'rust:i32': { 'c:int': '안전 매핑' },
  'rust:i64': { 'c:long long': '안전 매핑' },
  'rust:f32': { 'c:float': '안전 매핑' },
  'rust:f64': { 'c:double': '안전 매핑' },
  'rust:bool': { 'c:int': '안전 매핑' },
  'rust:u32': { 'c:unsigned int': '안전 매핑' },
  'rust:u64': { 'c:unsigned long long': '안전 매핑' },

  // Go → C
  'go:int32': { 'c:int': '안전 매핑' },
  'go:int64': { 'c:long long': '안전 매핑' },
  'go:float32': { 'c:float': '안전 매핑' },
  'go:float64': { 'c:double': '안전 매핑' },
  'go:bool': { 'c:int': '안전 매핑' },

  // C ↔ C (자명)
  'c:int': { 'c:int': '항등' },
  'c:long long': { 'c:long long': '항등' },
  'c:double': { 'c:double': '항등' },
};

/**
 * Tier 2: 안전 확대 변환 (축소는 Tier 3)
 *
 * 예:
 * - i32 → i64 (확대: 항상 안전)
 * - f32 → f64 (확대: 항상 안전)
 * - unsigned → signed (같은 크기: 주의 필요)
 */
export const TIER_2_RULES: Array<{
  from: string;
  to: string;
  pattern: 'widening' | 'automatic';
  suggestion: string;
}> = [
  { from: 'i32', to: 'i64', pattern: 'widening', suggestion: 'i32→i64 확대 변환: 안전합니다.' },
  { from: 'i32', to: 'i64', pattern: 'widening', suggestion: 'i32→i64 확대 변환: 안전합니다.' },
  { from: 'f32', to: 'f64', pattern: 'widening', suggestion: 'f32→f64 확대 변환: 안전합니다.' },
  { from: 'u32', to: 'u64', pattern: 'widening', suggestion: 'u32→u64 확대 변환: 안전합니다.' },
];

/**
 * Tier 3: 명시적 변환 필요 (@cast 필수)
 *
 * 예:
 * - i64 → i32 (축소: 오버플로우 위험)
 * - f64 → i64 (타입 변환: 정밀도 손실)
 * - signed ↔ unsigned (부호 해석 변경)
 */
export const TIER_3_RULES: Array<{
  from: string;
  to: string;
  pattern: string;
  suggestion: string;
}> = [
  { from: 'i64', to: 'i32', pattern: 'narrowing', suggestion: 'i64→i32 축소 변환: 오버플로우 위험. @cast 필수.' },
  { from: 'f64', to: 'i64', pattern: 'truncate', suggestion: 'f64→i64 변환: 소수 손실. @cast 필수.' },
  { from: 'i32', to: 'u32', pattern: 'sign_change', suggestion: 'i32↔u32 부호 변환: @cast 필수.' },
  { from: 'f64', to: 'f32', pattern: 'narrowing_float', suggestion: 'f64→f32 축소 변환: @cast 필수.' },
];

/**
 * Tier 4: 금지/미지원
 *
 * 예:
 * - struct → i64 (복합 타입)
 * - function pointer → int (함수 포인터)
 * - void* (언어별 런타임) → 직접 매핑 불가
 */
export const TIER_4_RULES: Array<{
  pattern: string;
  suggestion: string;
}> = [
  { pattern: 'struct_to_primitive', suggestion: '구조체는 primitive 타입으로 직접 변환 불가. 필드 단위로 분해하세요.' },
  { pattern: 'function_pointer', suggestion: '함수 포인터는 현재 미지원. ABI 계약 재설계 필요.' },
  { pattern: 'array_by_value', suggestion: '배열 by-value는 현재 미지원. 포인터 + 길이로 변경하세요.' },
  { pattern: 'complex_pointer', suggestion: '복합 포인터 체인은 현재 미지원.' },
];

/**
 * 포인터 규칙 (최소)
 *
 * *const T → const T*
 * *mut T → T*
 */
export const POINTER_RULES = {
  'rust:*const u8': { 'c:const char*': 1, suggestion: '*const u8 → const char*' },
  'rust:*mut u8': { 'c:char*': 1, suggestion: '*mut u8 → char*' },
  'rust:*const i32': { 'c:const int*': 1, suggestion: '*const i32 → const int*' },
  'rust:*mut i64': { 'c:long long*': 1, suggestion: '*mut i64 → long long*' },
};

/**
 * 타입 변환 분류 및 Tier 반환
 *
 * @param fromLang 출발 언어 (rust, go, c, zig 등)
 * @param fromType 출발 타입 (i32, i64, f64 등)
 * @param toLang 도착 언어 (c, go 등)
 * @param toType 도착 타입 (int, long long 등)
 * @returns { tier: 1-4, suggestion: string }
 */
export function classifyTypeConversion(
  fromLang: string,
  fromType: string,
  toLang: string,
  toType: string
): { tier: TypeTier; suggestion: string } {
  const key = `${fromLang}:${fromType}`;
  const targetKey = `${toLang}:${toType}`;

  // 1. Tier 1: 정확 매핑 확인
  if (TIER_1_MAPPINGS[key] && TIER_1_MAPPINGS[key][targetKey]) {
    return { tier: 1, suggestion: '안전한 타입 매핑입니다.' };
  }

  // 2. Tier 2: 확대 변환 확인
  for (const rule of TIER_2_RULES) {
    if (fromType === rule.from && toType === rule.to && rule.pattern === 'widening') {
      return { tier: 2, suggestion: rule.suggestion };
    }
  }

  // 3. Tier 3: 명시적 변환 확인
  for (const rule of TIER_3_RULES) {
    if (fromType === rule.from && toType === rule.to) {
      return { tier: 3, suggestion: rule.suggestion };
    }
  }

  // 4. Tier 4: 금지 패턴 확인
  if (fromType.includes('struct') || toType.includes('struct')) {
    return { tier: 4, suggestion: '구조체는 primitive 타입으로 직접 변환 불가.' };
  }

  if (fromType.includes('*') && !toType.includes('*')) {
    return { tier: 4, suggestion: '포인터는 primitive 타입으로 직접 변환 불가.' };
  }

  // 5. Default: Unknown
  return { tier: 1, suggestion: '타입 매핑을 확인할 수 없습니다.' };
}

/**
 * Tier 기반 진단 메시지 생성
 *
 * @param tier Tier 1-4
 * @param fromType 출발 타입
 * @param toType 도착 타입
 * @returns 사용자 메시지
 */
export function formatTypeConversionMessage(tier: TypeTier, fromType: string, toType: string): string {
  switch (tier) {
    case 1:
      return `[Type Bridge] Tier 1: ${fromType} → ${toType} (안전 매핑, 자동 적용)`;
    case 2:
      return `[Type Bridge] Tier 2: ${fromType} → ${toType} (안전 확대 변환)`;
    case 3:
      return `[Type Bridge] Tier 3: ${fromType} → ${toType} (명시적 @cast 필요)`;
    case 4:
      return `[Type Bridge] Tier 4: ${fromType} → ${toType} (미지원 변환)`;
    default:
      return `[Type Bridge] Unknown: ${fromType} → ${toType}`;
  }
}

/**
 * 16개 핵심 타입 조합 검증 리스트
 * (테스트 기준)
 */
export const CORE_TYPE_COMBINATIONS = [
  // Tier 1: 8개
  { from: 'i32', to: 'int', tier: 1 },
  { from: 'i64', to: 'long long', tier: 1 },
  { from: 'f32', to: 'float', tier: 1 },
  { from: 'f64', to: 'double', tier: 1 },
  { from: 'bool', to: 'int', tier: 1 },
  { from: 'u32', to: 'unsigned int', tier: 1 },
  { from: 'u64', to: 'unsigned long long', tier: 1 },

  // Tier 2: 3개
  { from: 'i32', to: 'i64', tier: 2 },
  { from: 'f32', to: 'f64', tier: 2 },
  { from: 'u32', to: 'u64', tier: 2 },

  // Tier 3: 3개
  { from: 'i64', to: 'i32', tier: 3 },
  { from: 'f64', to: 'i64', tier: 3 },
  { from: 'i32', to: 'u32', tier: 3 },

  // Tier 4: 2개
  { from: 'struct', to: 'i64', tier: 4 },
  { from: '*T', to: 'int', tier: 4 },
];
