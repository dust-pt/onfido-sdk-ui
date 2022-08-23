/*
  Responsibilities:
    - Provide public api
    - Send logs to centeral place
*/
import type { Logger } from './Logger'
import type { LabelKeyType } from './types'

export class LogInstance {
  private labels: string[]
  private dispatch: Logger['dispatch']

  constructor(labels: string | string[], dispatch: Logger['dispatch']) {
    this.labels = typeof labels === 'string' ? [labels] : labels
    this.dispatch = dispatch
  }

  // Note: filePath, methodName, lineNumber are injected at build time
  private capture = (level: LabelKeyType) => (
    message: string,
    metadata?: Record<string, unknown>,
    filePath?: string,
    methodName?: string,
    lineNumber?: string
  ) => {
    this.dispatch({
      labels: this.labels,
      level,
      message,
      metadata,
      filePath,
      methodName,
      lineNumber,
    })
  }

  public debug = this.capture('debug')
  public info = this.capture('info')
  public warning = this.capture('warning')
  public error = this.capture('error')
  public fatal = this.capture('fatal')
}
