/** 컴파일/실행 오류. 항상 줄·열 정보를 들고 다닌다. */
export class CompileError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'CompileError';
    this.line = line;
    this.col = col;
  }
}

export class RuntimeError extends Error {
  constructor(message, line, col) {
    super(message);
    this.name = 'RuntimeError';
    this.line = line;
    this.col = col;
  }
}
