import { v4 as uuidv4 } from "uuid";
import {
  AgentAction,
  AgentFinish,
  BaseChatMessage,
  ChainValues,
  LLMResult,
} from "../schema/index.js";
import { BaseCallbackHandler, CallbackHandlerMethods } from "./base.js";
import { ConsoleCallbackHandler } from "./handlers/console.js";
import {
  getTracingCallbackHandler,
  getTracingV2CallbackHandler,
} from "./handlers/initialize.js";
import { getBufferString } from "../memory/base.js";
import { getEnvironmentVariable } from "../util/env.js";
import {
  LangChainTracer,
  LangChainTracerFields,
} from "./handlers/tracer_langchain.js";
import { consumeCallback } from "./promises.js";

type BaseCallbackManagerMethods = {
  [K in keyof CallbackHandlerMethods]?: (
    ...args: Parameters<Required<CallbackHandlerMethods>[K]>
  ) => Promise<unknown>;
};

export interface CallbackManagerOptions {
  verbose?: boolean;
  tracing?: boolean;
}

export type Callbacks =
  | CallbackManager
  | (BaseCallbackHandler | CallbackHandlerMethods)[];

export abstract class BaseCallbackManager {
  abstract addHandler(handler: BaseCallbackHandler): void;

  abstract removeHandler(handler: BaseCallbackHandler): void;

  abstract setHandlers(handlers: BaseCallbackHandler[]): void;

  setHandler(handler: BaseCallbackHandler): void {
    return this.setHandlers([handler]);
  }
}

class BaseRunManager {
  constructor(
    public readonly runId: string,
    protected readonly handlers: BaseCallbackHandler[],
    protected readonly inheritableHandlers: BaseCallbackHandler[],
    protected readonly _parentRunId?: string
  ) {}

  async handleText(text: string): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          try {
            await handler.handleText?.(text, this.runId, this._parentRunId);
          } catch (err) {
            console.error(
              `Error in handler ${handler.constructor.name}, handleText: ${err}`
            );
          }
        }, handler.awaitHandlers)
      )
    );
  }
}

export class CallbackManagerForLLMRun
  extends BaseRunManager
  implements BaseCallbackManagerMethods
{
  async handleLLMNewToken(token: string): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreLLM) {
            try {
              await handler.handleLLMNewToken?.(
                token,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleLLMNewToken: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleLLMError(err: Error | unknown): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreLLM) {
            try {
              await handler.handleLLMError?.(
                err,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleLLMError: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleLLMEnd(output: LLMResult): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreLLM) {
            try {
              await handler.handleLLMEnd?.(
                output,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleLLMEnd: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }
}

export class CallbackManagerForChainRun
  extends BaseRunManager
  implements BaseCallbackManagerMethods
{
  getChild(): CallbackManager {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const manager = new CallbackManager(this.runId);
    manager.setHandlers(this.inheritableHandlers);
    return manager;
  }

  async handleChainError(err: Error | unknown): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreChain) {
            try {
              await handler.handleChainError?.(
                err,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleChainError: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleChainEnd(output: ChainValues): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreChain) {
            try {
              await handler.handleChainEnd?.(
                output,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleChainEnd: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleAgentAction(action: AgentAction): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
              await handler.handleAgentAction?.(
                action,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleAgentAction: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleAgentEnd(action: AgentFinish): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
              await handler.handleAgentEnd?.(
                action,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleAgentEnd: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }
}

export class CallbackManagerForToolRun
  extends BaseRunManager
  implements BaseCallbackManagerMethods
{
  getChild(): CallbackManager {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const manager = new CallbackManager(this.runId);
    manager.setHandlers(this.inheritableHandlers);
    return manager;
  }

  async handleToolError(err: Error | unknown): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
              await handler.handleToolError?.(
                err,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleToolError: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }

  async handleToolEnd(output: string): Promise<void> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
              await handler.handleToolEnd?.(
                output,
                this.runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleToolEnd: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
  }
}

export class CallbackManager
  extends BaseCallbackManager
  implements BaseCallbackManagerMethods
{
  handlers: BaseCallbackHandler[];

  inheritableHandlers: BaseCallbackHandler[];

  name = "callback_manager";

  private readonly _parentRunId?: string;

  constructor(parentRunId?: string) {
    super();
    this.handlers = [];
    this.inheritableHandlers = [];
    this._parentRunId = parentRunId;
  }

  async handleLLMStart(
    llm: { name: string },
    prompts: string[],
    runId: string = uuidv4(),
    _parentRunId: string | undefined = undefined,
    extraParams: Record<string, unknown> | undefined = undefined
  ): Promise<CallbackManagerForLLMRun> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreLLM) {
            try {
              await handler.handleLLMStart?.(
                llm,
                prompts,
                runId,
                this._parentRunId,
                extraParams
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleLLMStart: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
    return new CallbackManagerForLLMRun(
      runId,
      this.handlers,
      this.inheritableHandlers,
      this._parentRunId
    );
  }

  async handleChatModelStart(
    llm: { name: string },
    messages: BaseChatMessage[][],
    runId: string = uuidv4(),
    _parentRunId: string | undefined = undefined,
    extraParams: Record<string, unknown> | undefined = undefined
  ): Promise<CallbackManagerForLLMRun> {
    let messageStrings: string[];
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreLLM) {
            try {
              if (handler.handleChatModelStart)
                await handler.handleChatModelStart?.(
                  llm,
                  messages,
                  runId,
                  this._parentRunId,
                  extraParams
                );
              else if (handler.handleLLMStart) {
                messageStrings = messages.map((x) => getBufferString(x));
                await handler.handleLLMStart?.(
                  llm,
                  messageStrings,
                  runId,
                  this._parentRunId,
                  extraParams
                );
              }
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleLLMStart: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
    return new CallbackManagerForLLMRun(
      runId,
      this.handlers,
      this.inheritableHandlers,
      this._parentRunId
    );
  }

  async handleChainStart(
    chain: { name: string },
    inputs: ChainValues,
    runId = uuidv4()
  ): Promise<CallbackManagerForChainRun> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreChain) {
            try {
              await handler.handleChainStart?.(
                chain,
                inputs,
                runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleChainStart: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
    return new CallbackManagerForChainRun(
      runId,
      this.handlers,
      this.inheritableHandlers,
      this._parentRunId
    );
  }

  async handleToolStart(
    tool: { name: string },
    input: string,
    runId = uuidv4()
  ): Promise<CallbackManagerForToolRun> {
    await Promise.all(
      this.handlers.map((handler) =>
        consumeCallback(async () => {
          if (!handler.ignoreAgent) {
            try {
              await handler.handleToolStart?.(
                tool,
                input,
                runId,
                this._parentRunId
              );
            } catch (err) {
              console.error(
                `Error in handler ${handler.constructor.name}, handleToolStart: ${err}`
              );
            }
          }
        }, handler.awaitHandlers)
      )
    );
    return new CallbackManagerForToolRun(
      runId,
      this.handlers,
      this.inheritableHandlers,
      this._parentRunId
    );
  }

  addHandler(handler: BaseCallbackHandler, inherit = true): void {
    this.handlers.push(handler);
    if (inherit) {
      this.inheritableHandlers.push(handler);
    }
  }

  removeHandler(handler: BaseCallbackHandler): void {
    this.handlers = this.handlers.filter((_handler) => _handler !== handler);
    this.inheritableHandlers = this.inheritableHandlers.filter(
      (_handler) => _handler !== handler
    );
  }

  setHandlers(handlers: BaseCallbackHandler[], inherit = true): void {
    this.handlers = [];
    this.inheritableHandlers = [];
    for (const handler of handlers) {
      this.addHandler(handler, inherit);
    }
  }

  copy(
    additionalHandlers: BaseCallbackHandler[] = [],
    inherit = true
  ): CallbackManager {
    const manager = new CallbackManager(this._parentRunId);
    for (const handler of this.handlers) {
      const inheritable = this.inheritableHandlers.includes(handler);
      manager.addHandler(handler, inheritable);
    }
    for (const handler of additionalHandlers) {
      if (
        // Prevent multiple copies of console_callback_handler
        manager.handlers
          .filter((h) => h.name === "console_callback_handler")
          .some((h) => h.name === handler.name)
      ) {
        continue;
      }
      manager.addHandler(handler, inherit);
    }
    return manager;
  }

  static fromHandlers(handlers: CallbackHandlerMethods) {
    class Handler extends BaseCallbackHandler {
      name = uuidv4();

      constructor() {
        super();
        Object.assign(this, handlers);
      }
    }

    const manager = new this();
    manager.addHandler(new Handler());
    return manager;
  }

  static async configure(
    inheritableHandlers?: Callbacks,
    localHandlers?: Callbacks,
    options?: CallbackManagerOptions
  ): Promise<CallbackManager | undefined> {
    let callbackManager: CallbackManager | undefined;
    if (inheritableHandlers || localHandlers) {
      if (Array.isArray(inheritableHandlers) || !inheritableHandlers) {
        callbackManager = new CallbackManager();
        callbackManager.setHandlers(
          inheritableHandlers?.map(ensureHandler) ?? [],
          true
        );
      } else {
        callbackManager = inheritableHandlers;
      }
      callbackManager = callbackManager.copy(
        Array.isArray(localHandlers)
          ? localHandlers.map(ensureHandler)
          : localHandlers?.handlers,
        false
      );
    }
    const verboseEnabled =
      getEnvironmentVariable("LANGCHAIN_VERBOSE") || options?.verbose;
    const tracingV2Enabled =
      getEnvironmentVariable("LANGCHAIN_TRACING_V2") ?? false;
    const tracingEnabled =
      tracingV2Enabled ||
      (getEnvironmentVariable("LANGCHAIN_TRACING") ?? false);
    if (verboseEnabled || tracingEnabled) {
      if (!callbackManager) {
        callbackManager = new CallbackManager();
      }
      if (
        verboseEnabled &&
        !callbackManager.handlers.some(
          (handler) => handler.name === ConsoleCallbackHandler.prototype.name
        )
      ) {
        const consoleHandler = new ConsoleCallbackHandler();
        callbackManager.addHandler(consoleHandler, true);
      }
      if (
        tracingEnabled &&
        !callbackManager.handlers.some(
          (handler) => handler.name === "langchain_tracer"
        )
      ) {
        if (tracingV2Enabled) {
          callbackManager.addHandler(await getTracingV2CallbackHandler(), true);
        } else {
          const session = getEnvironmentVariable("LANGCHAIN_SESSION");
          callbackManager.addHandler(
            await getTracingCallbackHandler(session),
            true
          );
        }
      }
    }
    return callbackManager;
  }
}

function ensureHandler(
  handler: BaseCallbackHandler | CallbackHandlerMethods
): BaseCallbackHandler {
  if ("name" in handler) {
    return handler;
  }

  return BaseCallbackHandler.fromMethods(handler);
}

export class TraceGroup {
  private runManager?: CallbackManagerForChainRun;

  constructor(
    private groupName: string,
    private options?: {
      sessionName?: string;
      exampleId?: string;
    }
  ) {}

  private async getTraceGroupCallbackManager(
    group_name: string,
    options?: LangChainTracerFields
  ): Promise<CallbackManagerForChainRun> {
    const cb = new LangChainTracer(options);
    const cm = await CallbackManager.configure([cb]);
    const runManager = await cm?.handleChainStart({ name: group_name }, {});
    if (!runManager) {
      throw new Error("Failed to create run group callback manager.");
    }
    return runManager;
  }

  async start(): Promise<CallbackManager> {
    if (!this.runManager) {
      this.runManager = await this.getTraceGroupCallbackManager(
        this.groupName,
        this.options
      );
    }
    return this.runManager.getChild();
  }

  async end(): Promise<void> {
    if (this.runManager) {
      await this.runManager.handleChainEnd({});
      this.runManager = undefined;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function traceAsGroup<T, A extends any[]>(
  groupOptions: {
    name: string;
  } & LangChainTracerFields,
  enclosedCode: (manager: CallbackManager, ...args: A) => Promise<T>,
  ...args: A
): Promise<T> {
  const traceGroup = new TraceGroup(groupOptions.name, groupOptions);
  const callbackManager = await traceGroup.start();
  try {
    return await enclosedCode(callbackManager, ...args);
  } finally {
    await traceGroup.end();
  }
}
