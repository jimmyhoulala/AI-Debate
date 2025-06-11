from langchain_openai import ChatOpenAI
from langchain_community.tools.arxiv.tool import ArxivQueryRun
from langchain.agents import Tool, initialize_agent

class DynamicRAG:
    def __init__(self, llm=None):
        self.llm = llm or ChatOpenAI(
            temperature=0.2,
            model="gpt-4o-mini",
            openai_api_key="sk-zk2c86662738a05b2a08eecd7c930008994682586cf9e781",
            base_url="https://api.zhizengzeng.com/v1"
        )
        self.retriever_tool = Tool.from_function(
            func=ArxivQueryRun().run,
            name="AcademicPaperSearch",
            description="Useful for searching academic papers related to a debate topic"
        )
        self.agent = initialize_agent(
            tools=[self.retriever_tool],
            llm=self.llm,
            agent="chat-zero-shot-react-description",
            verbose=True
        )

    def get_evidence(self, topic: str) -> str:
        query = f"Find recent academic evidence or arguments related to: {topic}"
        response = self.agent.run(query)
        return response



if __name__ == "__main__":
    rag = DynamicRAG()
    topic = "Should governments impose carbon tax policies?"
    evidence = rag.get_evidence(topic)
    print("🔍 检索到的内容：\n", evidence)
