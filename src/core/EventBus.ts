/**
 * 通用事件总线 - 发布/订阅模式
 *
 * 引擎级模块，零业务依赖，可直接复用到任何 TypeScript 项目。
 */

type EventHandler = (...args: any[]) => void;

class EventBusClass {
  private _listeners: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event)!.push(handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  once(event: string, handler: EventHandler): void {
    const wrapper = (...args: any[]) => {
      handler(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this._listeners.get(event);
    if (!handlers) return;
    // 复制一份避免在回调中修改数组
    [...handlers].forEach(handler => {
      try {
        handler(...args);
      } catch (e) {
        const err = e instanceof Error
          ? `${e.name}: ${e.message}\n${e.stack ?? ''}`
          : String(e);
        console.error(`[EventBus] 事件 "${event}" 处理出错: ${err}`);
      }
    });
  }

  clear(event?: string): void {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }
}

export const EventBus = new EventBusClass();
