export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, data?: any) {
    console.log(`[${this.context}] [INFO] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  error(message: string, error?: any) {
    console.error(`[${this.context}] [ERROR] ${message}`);
    if (error) {
      console.error(error);
    }
  }

  warn(message: string, data?: any) {
    console.warn(`[${this.context}] [WARN] ${message}`);
    if (data) {
      console.warn(JSON.stringify(data, null, 2));
    }
  }
}
