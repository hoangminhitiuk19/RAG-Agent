/**
 * Interface for all agent responses
 */
interface AgentResponse {
    message: string;
    sources?: Array<{
      source: string;
      text: string;
    }>;
    functionCalls?: Array<FunctionCall>;
    needsFollowUp?: boolean;
  }
  
  /**
   * Interface for function calls that agents can make
   */
  interface FunctionCall {
    name: string;
    arguments: Record<string, any>;
    description?: string;
  }
  
  /**
   * Interface defining the core structure of all agents
   */
  interface Agent {
    process(input: {
      message: string;
      conversationHistory: Array<{role: string, content: string}>;
      farmContext?: any;
      retrievedContext?: Array<any>;
    }): Promise<AgentResponse>;
  }
  
  export { Agent, AgentResponse, FunctionCall };