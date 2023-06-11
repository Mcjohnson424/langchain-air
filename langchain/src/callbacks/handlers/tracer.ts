import {
  AgentAction,
  BaseChatMessage,
  ChainValues,
  LLMResult,
  RunInputs,
  RunOutputs,
} from "../../schema/index.js";
import { BaseCallbackHandler } from "../base.js";

export type RunType = "llm" | "chain" | "tool";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Extra = Record<string, any>;
export interface BaseRun {
  id: string;
  name: string;
  start_time: number;
  end_time?: number;
  extra?: Extra;
  error?: string;
  execution_order: number;
  serialized: object;
  inputs: RunInputs;
  outputs?: RunOutputs;
  reference_example_id?: string; // uuid
  run_type: RunType;
}

export interface Run extends BaseRun {
  child_runs: this[];
  child_execution_order: number;
  parent_run_id?: string; // uuid
}

export interface AgentRun extends Run {
  actions: AgentAction[];
}

export abstract class BaseTracer extends BaseCallbackHandler {
  protected runMap: Map<string, Run> = new Map();

  constructor() {
    super();
  }

  copy(): this {
    return this;
  }

  protected abstract persistRun(run: Run): Promise<void>;

  protected _addChildRun(parentRun: Run, childRun: Run) {
    parentRun.child_runs.push(childRun);
  }

  protected _startTrace(run: Run) {
    if (run.parent_run_id !== undefined) {
      const parentRun = this.runMap.get(run.parent_run_id);
      if (parentRun) {
        this._addChildRun(parentRun, run);
      }
    }
    this.runMap.set(run.id, run);
  }

  protected async _endTrace(run: Run): Promise<void> {
    const parentRun =
      run.parent_run_id !== undefined && this.runMap.get(run.parent_run_id);
    if (parentRun) {
      parentRun.child_execution_order = Math.max(
        parentRun.child_execution_order,
        run.child_execution_order
      );
    } else {
      await this.persistRun(run);
    }
    this.runMap.delete(run.id);
  }

  protected _getExecutionOrder(parentRunId: string | undefined): number {
    const parentRun = parentRunId !== undefined && this.runMap.get(parentRunId);
    // If a run has no parent then execution order is 1
    if (!parentRun) {
      return 1;
    }

    return parentRun.child_execution_order + 1;
  }

  async handleLLMStart(
    llm: { name: string },
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>
  ): Promise<void> {
    const execution_order = this._getExecutionOrder(parentRunId);
    const run: Run = {
      id: runId,
      name: llm.name,
      parent_run_id: parentRunId,
      start_time: Date.now(),
      serialized: llm,
      inputs: { prompts },
      execution_order,
      child_runs: [],
      child_execution_order: execution_order,
      run_type: "llm",
      extra: extraParams,
    };

    this._startTrace(run);
    await this.onLLMStart?.(run);
  }

  async handleChatModelStart(
    llm: { name: string },
    messages: BaseChatMessage[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>
  ): Promise<void> {
    const execution_order = this._getExecutionOrder(parentRunId);
    const run: Run = {
      id: runId,
      name: llm.name,
      parent_run_id: parentRunId,
      start_time: Date.now(),
      serialized: llm,
      inputs: { messages },
      execution_order,
      child_runs: [],
      child_execution_order: execution_order,
      run_type: "llm",
      extra: extraParams,
    };

    this._startTrace(run);
    await this.onLLMStart?.(run);
  }

  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const run = this.runMap.get(runId);
    if (!run || run?.run_type !== "llm") {
      throw new Error("No LLM run to end.");
    }
    run.end_time = Date.now();
    run.outputs = output;
    await this.onLLMEnd?.(run);
    await this._endTrace(run);
  }

  async handleLLMError(error: Error, runId: string): Promise<void> {
    const run = this.runMap.get(runId);
    if (!run || run?.run_type !== "llm") {
      throw new Error("No LLM run to end.");
    }
    run.end_time = Date.now();
    run.error = error.message;
    await this.onLLMError?.(run);
    await this._endTrace(run);
  }

  async handleChainStart(
    chain: { name: string },
    inputs: ChainValues,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    const execution_order = this._getExecutionOrder(parentRunId);
    const run: Run = {
      id: runId,
      name: chain.name,
      parent_run_id: parentRunId,
      start_time: Date.now(),
      serialized: chain,
      inputs,
      execution_order,
      child_execution_order: execution_order,
      run_type: "chain",
      child_runs: [],
    };

    this._startTrace(run);
    await this.onChainStart?.(run);
  }

  async handleChainEnd(outputs: ChainValues, runId: string): Promise<void> {
    const run = this.runMap.get(runId);
    if (!run || run?.run_type !== "chain") {
      throw new Error("No chain run to end.");
    }
    run.end_time = Date.now();
    run.outputs = outputs;
    await this.onChainEnd?.(run);
    await this._endTrace(run);
  }

  async handleChainError(error: Error, runId: string): Promise<void> {
    const run = this.runMap.get(runId);
    if (!run || run?.run_type !== "chain") {
      throw new Error("No chain run to end.");
    }
    run.end_time = Date.now();
    run.error = error.message;
    await this.onChainError?.(run);
    await this._endTrace(run);
  }

  async handleToolStart(
    tool: { name: string },
    input: string,
    runId: string,
    parentRunId?: string
  ): Promise<void> {
    const execution_order = this._getExecutionOrder(parentRunId);
    const run: Run = {
      id: runId,
      name: tool.name,
      parent_run_id: parentRunId,
      start_time: Date.now(),
      serialized: tool,
      inputs: { input },
      execution_order,
      child_execution_order: execution_order,
      run_type: "tool",
      child_runs: [],
    };

    this._startTrace(run);
    await this.onToolStart?.(run);
  }

  async handleToolEnd(output: string, runId: string): Promise<void> {
    const run = this.runMap.get(runId);
    if (!run || run?.run_type !== "tool") {
      throw new Error("No tool run to end");
    }
    run.end_time = Date.now();
    run.outputs = { output };
    await this.onToolEnd?.(run);
    await this._endTrace(run);
  }

  async handleToolError(error: Error, runId: string): Promise<void> {
    const run = this.runMap.get(runId);
    if (!run || run?.run_type !== "tool") {
      throw new Error("No tool run to end");
    }
    run.end_time = Date.now();
    run.error = error.message;
    await this.onToolError?.(run);
    await this._endTrace(run);
  }

  async handleAgentAction(action: AgentAction, runId: string): Promise<void> {
    const run = this.runMap.get(runId);
    if (!run || run?.run_type !== "chain") {
      return;
    }
    const agentRun = run as AgentRun;
    agentRun.actions = agentRun.actions || [];
    agentRun.actions.push(action);
    await this.onAgentAction?.(run as AgentRun);
  }

  // custom event handlers

  onLLMStart?(run: Run): void | Promise<void>;

  onLLMEnd?(run: Run): void | Promise<void>;

  onLLMError?(run: Run): void | Promise<void>;

  onChainStart?(run: Run): void | Promise<void>;

  onChainEnd?(run: Run): void | Promise<void>;

  onChainError?(run: Run): void | Promise<void>;

  onToolStart?(run: Run): void | Promise<void>;

  onToolEnd?(run: Run): void | Promise<void>;

  onToolError?(run: Run): void | Promise<void>;

  onAgentAction?(run: Run): void | Promise<void>;

  // TODO Implement handleAgentEnd, handleText

  // onAgentEnd?(run: ChainRun): void | Promise<void>;

  // onText?(run: Run): void | Promise<void>;
}
