import { agentFunctions } from "./agent-functions";
import { ScriptWriter } from "@evo-ninja/script-writer-agent";
import { IWrapPackage } from "@polywrap/client-js";
import { ResultErr } from "@polywrap/result";
import { IAgent, Workspace, LlmApi, Chat, Logger, StepOutput, RunResult, InMemoryWorkspace, executeAgentFunction, basicFunctionCallLoop, AgentFunction } from "@evo-ninja/agent-utils";
import { AgentContext } from "./AgentContext";
import { GOAL_PROMPT, INITIAL_PROMP, LOOP_PREVENTION_PROMPT } from "./prompts";
import { Scripts } from "./Scripts";
import { WrapClient } from "./wrap";

export class Evo implements IAgent {
  private readonly context: AgentContext
  private currentFunctions: AgentFunction<AgentContext>[]

  constructor(
    private readonly llm: LlmApi,
    private readonly chat: Chat,
    private readonly logger: Logger,
    private readonly workspace: Workspace,
    private readonly agentPackage: IWrapPackage,
    scripts: Scripts,
  ) {
    const createScriptWriter = (): ScriptWriter => {
      const workspace = new InMemoryWorkspace();
      const chat = new Chat(workspace, this.llm, this.chat.tokenizer, this.logger);
      return new ScriptWriter(this.llm, chat, this.logger, workspace);
    };
    this.currentFunctions = agentFunctions(createScriptWriter);

    this.context = {
      llm,
      chat,
      workspace,
      scripts,
      logger,
      globals: {},
      functions: this.currentFunctions,
      client: new WrapClient(
        this.workspace,
        this.logger,
        this.agentPackage
      ),
    };
  }

  public async* run(goal: string): AsyncGenerator<StepOutput, RunResult, string | undefined> {
    const { chat } = this.context;

    try {
      chat.persistent("system", INITIAL_PROMP);
      chat.persistent("system", GOAL_PROMPT(goal));
      
      return yield* basicFunctionCallLoop(
        this.context,
        executeAgentFunction,
        this.currentFunctions,
        LOOP_PREVENTION_PROMPT
      );
    } catch (err) {
      this.logger.error(err);
      return ResultErr("Unrecoverable error encountered.");
    }
  }
}