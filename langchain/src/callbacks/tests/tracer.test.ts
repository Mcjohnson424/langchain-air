import { test, expect, jest } from "@jest/globals";
import * as uuid from "uuid";
import { BaseTracer, Run } from "../handlers/tracer.js";
import { HumanChatMessage } from "../../schema/index.js";

const _DATE = 1620000000000;

Date.now = jest.fn(() => _DATE);

class FakeTracer extends BaseTracer {
  name = "fake_tracer";

  runs: Run[] = [];

  constructor() {
    super();
  }

  protected persistRun(run: Run): Promise<void> {
    this.runs.push(run);
    return Promise.resolve();
  }
}

test("Test LLMRun", async () => {
  const tracer = new FakeTracer();
  const runId = uuid.v4();
  await tracer.handleLLMStart({ name: "test" }, ["test"], runId);
  await tracer.handleLLMEnd({ generations: [] }, runId);
  expect(tracer.runs.length).toBe(1);
  const run = tracer.runs[0];
  const compareRun: Run = {
    id: runId,
    name: "test",
    start_time: _DATE,
    end_time: _DATE,
    execution_order: 1,
    child_execution_order: 1,
    serialized: { name: "test" },
    inputs: { prompts: ["test"] },
    run_type: "llm",
    outputs: { generations: [] },
    child_runs: [],
  };
  expect(run).toEqual(compareRun);
});

test("Test Chat Message Run", async () => {
  const tracer = new FakeTracer();
  const runId = uuid.v4();
  const messages = [[new HumanChatMessage("Avast")]];
  await tracer.handleChatModelStart({ name: "test" }, messages, runId);
  await tracer.handleLLMEnd({ generations: [] }, runId);
  expect(tracer.runs.length).toBe(1);
  const run = tracer.runs[0];
  expect(run).toMatchInlineSnapshot(
    {
      id: expect.any(String),
    },
    `
    {
      "child_execution_order": 1,
      "child_runs": [],
      "end_time": 1620000000000,
      "execution_order": 1,
      "extra": undefined,
      "id": Any<String>,
      "inputs": {
        "messages": [
          [
            {
              "data": {
                "content": "Avast",
                "role": undefined,
              },
              "type": "human",
            },
          ],
        ],
      },
      "name": "test",
      "outputs": {
        "generations": [],
      },
      "parent_run_id": undefined,
      "run_type": "llm",
      "serialized": {
        "name": "test",
      },
      "start_time": 1620000000000,
    }
  `
  );
});

test("Test LLM Run no start", async () => {
  const tracer = new FakeTracer();
  const runId = uuid.v4();
  await expect(tracer.handleLLMEnd({ generations: [] }, runId)).rejects.toThrow(
    "No LLM run to end"
  );
});

test("Test Chain Run", async () => {
  const tracer = new FakeTracer();
  const runId = uuid.v4();
  const compareRun: Run = {
    id: runId,
    name: "test",
    start_time: _DATE,
    end_time: _DATE,
    execution_order: 1,
    child_execution_order: 1,
    serialized: { name: "test" },
    inputs: { foo: "bar" },
    outputs: { foo: "bar" },
    run_type: "chain",
    child_runs: [],
  };
  await tracer.handleChainStart({ name: "test" }, { foo: "bar" }, runId);
  await tracer.handleChainEnd({ foo: "bar" }, runId);
  expect(tracer.runs.length).toBe(1);
  const run = tracer.runs[0];
  expect(run).toEqual(compareRun);
});

test("Test Tool Run", async () => {
  const tracer = new FakeTracer();
  const runId = uuid.v4();
  const compareRun: Run = {
    id: runId,
    name: "test",
    start_time: _DATE,
    end_time: _DATE,
    execution_order: 1,
    child_execution_order: 1,
    serialized: { name: "test" },
    inputs: { input: "test" },
    outputs: { output: "output" },
    run_type: "tool",
    child_runs: [],
  };
  await tracer.handleToolStart({ name: "test" }, "test", runId);
  await tracer.handleToolEnd("output", runId);
  expect(tracer.runs.length).toBe(1);
  const run = tracer.runs[0];
  expect(run).toEqual(compareRun);
});

test("Test nested runs", async () => {
  const tracer = new FakeTracer();
  const chainRunId = uuid.v4();
  const toolRunId = uuid.v4();
  const llmRunId = uuid.v4();
  await tracer.handleChainStart({ name: "test2" }, { foo: "bar" }, chainRunId);
  await tracer.handleToolStart(
    { name: "test_tool" },
    "test",
    toolRunId,
    chainRunId
  );
  await tracer.handleLLMStart(
    { name: "test_llm_child_run" },
    ["test"],
    llmRunId,
    toolRunId
  );
  await tracer.handleLLMEnd({ generations: [[]] }, llmRunId);
  await tracer.handleToolEnd("output", toolRunId);
  const llmRunId2 = uuid.v4();
  await tracer.handleLLMStart(
    { name: "test_llm2" },
    ["test"],
    llmRunId2,
    chainRunId
  );
  await tracer.handleLLMEnd({ generations: [[]] }, llmRunId2);
  await tracer.handleChainEnd({ foo: "bar" }, chainRunId);
  const compareRun: Run = {
    child_runs: [
      {
        id: toolRunId,
        name: "test_tool",
        parent_run_id: chainRunId,
        child_runs: [
          {
            id: llmRunId,
            name: "test_llm_child_run",
            parent_run_id: toolRunId,
            end_time: 1620000000000,
            execution_order: 3,
            child_execution_order: 3,
            inputs: { prompts: ["test"] },
            outputs: {
              generations: [[]],
            },
            serialized: {
              name: "test_llm_child_run",
            },
            start_time: 1620000000000,
            run_type: "llm",
            child_runs: [],
          },
        ],
        end_time: 1620000000000,
        execution_order: 2,
        child_execution_order: 3,
        outputs: { output: "output" },
        serialized: {
          name: "test_tool",
        },
        start_time: 1620000000000,
        inputs: { input: "test" },
        run_type: "tool",
      },
      {
        id: llmRunId2,
        name: "test_llm2",
        parent_run_id: chainRunId,
        end_time: 1620000000000,
        execution_order: 4,
        child_execution_order: 4,
        inputs: { prompts: ["test"] },
        outputs: {
          generations: [[]],
        },
        serialized: {
          name: "test_llm2",
        },
        start_time: 1620000000000,
        run_type: "llm",
        child_runs: [],
      },
    ],
    id: chainRunId,
    end_time: 1620000000000,
    execution_order: 1,
    child_execution_order: 4,
    inputs: {
      foo: "bar",
    },
    outputs: {
      foo: "bar",
    },
    serialized: {
      name: "test2",
    },
    name: "test2",
    start_time: 1620000000000,
    run_type: "chain",
  };
  expect(tracer.runs.length).toBe(1);
  expect(tracer.runs[0]).toEqual(compareRun);

  const llmRunId3 = uuid.v4();
  await tracer.handleLLMStart({ name: "test" }, ["test"], llmRunId3);
  await tracer.handleLLMEnd({ generations: [[]] }, llmRunId3);
  expect(tracer.runs.length).toBe(2);
});
