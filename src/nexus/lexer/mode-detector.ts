/**
 * Mode Detector for Nexus Lexer
 * Automatically detects V mode vs Python mode
 */

export class ModeDetector {
  private patterns = {
    // V patterns
    vStructDef: /struct\s+\w+\s*\{/,
    vFnDef: /fn\s+\w+\s*\(/,
    vLetDef: /let\s+\w+\s*=/,
    vMutDef: /mut\s+\w+/,
    vTypeAnnotation: /:\s*\w+\s*[=\{\(;,]/,
    vTraitDef: /trait\s+\w+/,
    vImplDef: /impl\s+\w+/,
    vCurlyBlocks: /\{\s*\n.*\n\s*\}/m,

    // Python patterns
    pyDefFunc: /def\s+\w+\s*\(/,
    pyClassDef: /class\s+\w+\s*[:\(]/,
    pyIndentedBlock: /:\s*\n\s+\S/,
    pyDecorator: /@\w+/,
    pyFromImport: /from\s+\w+\s+import/,
    pyListComp: /\[.*\s+for\s+.*\sin\s+.*\]/,
  };

  detect(source: string): 'v' | 'python' {
    const vScore = this.scoreLanguage(source, 'v');
    const pythonScore = this.scoreLanguage(source, 'python');

    return vScore > pythonScore ? 'v' : 'python';
  }

  private scoreLanguage(source: string, lang: 'v' | 'python'): number {
    let score = 0;

    if (lang === 'v') {
      if (this.patterns.vStructDef.test(source)) score += 3;
      if (this.patterns.vFnDef.test(source)) score += 2;
      if (this.patterns.vLetDef.test(source)) score += 1;
      if (this.patterns.vMutDef.test(source)) score += 1;
      if (this.patterns.vTypeAnnotation.test(source)) score += 2;
      if (this.patterns.vTraitDef.test(source)) score += 3;
      if (this.patterns.vImplDef.test(source)) score += 3;
    } else {
      if (this.patterns.pyDefFunc.test(source)) score += 3;
      if (this.patterns.pyClassDef.test(source)) score += 3;
      if (this.patterns.pyIndentedBlock.test(source)) score += 2;
      if (this.patterns.pyDecorator.test(source)) score += 2;
      if (this.patterns.pyFromImport.test(source)) score += 1;
      if (this.patterns.pyListComp.test(source)) score += 1;
    }

    return score;
  }
}
