from langchain_community.chat_models import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.schema.runnable import RunnablePassthrough
import gradio as gr
from utils import load_model_configs
from prompts import DEBATE_TEMPLATE, FINAL_CONSENSUS_TEMPLATE
import time
import traceback

class ThreeGiantsDebate:
    def __init__(self):
        print("初始化辩论系统...")
        self.load_models()
        self.test_models()  # 添加模型测试
        self.create_chains()
        
    def load_models(self):
        """初始化三个模型"""
        print("\n开始加载模型配置...")
        configs = load_model_configs()
        self.models = []
        for config in configs:
            try:
                print(f"\n正在初始化模型: {config['name']}")
                model = {
                    'name': config['name'],
                    'llm': ChatOpenAI(
                        base_url=config['base_url'],
                        api_key=config['api_key'],
                        model=config['name'],
                        temperature=0.7,
                        max_tokens=2000
                    )
                }
                self.models.append(model)
                print(f"模型 {config['name']} 加载成功")
            except Exception as e:
                print(f"模型 {config['name']} 加载失败: {str(e)}")
                print(f"错误详情: {traceback.format_exc()}")
        
        if not self.models:
            raise Exception("没有成功加载任何模型")
        print(f"\n成功加载 {len(self.models)} 个模型")
        
    def test_models(self):
        """测试所有模型的基本功能"""
        print("\n开始测试所有模型...")
        test_prompt = ChatPromptTemplate.from_template("请回答问题：1+1等于几？请只回复数字。")
        
        for model in self.models:
            print(f"\n测试模型 {model['name']}...")
            try:
                start_time = time.time()
                chain = test_prompt | model['llm']
                response = chain.invoke({})
                end_time = time.time()
                
                print(f"✓ 模型 {model['name']} 测试成功")
                print(f"  响应时间: {end_time - start_time:.2f}秒")
                print(f"  响应内容: {response.content}")
            except Exception as e:
                print(f"✗ 模型 {model['name']} 测试失败")
                print(f"  错误信息: {str(e)}")
                print(f"  详细错误: {traceback.format_exc()}")
        print("\n模型测试完成")
        
    def create_chains(self):
        """创建可运行序列"""
        print("\n创建提示模板和运行序列...")
        debate_prompt = ChatPromptTemplate.from_template(DEBATE_TEMPLATE)
        consensus_prompt = ChatPromptTemplate.from_template(FINAL_CONSENSUS_TEMPLATE)
        
        self.debate_chain = debate_prompt | self.models[0]['llm']
        self.consensus_chain = consensus_prompt | self.models[0]['llm']

    def debate(self, question):
        """执行辩论过程"""
        print(f"\n收到新的辩论问题: {question}")
        start_time = time.time()
        
        try:
            opinions = []
            for i, model in enumerate(self.models):
                role = "supervisor" if i == 0 else "regular"
                print(f"\n正在获取模型 {model['name']} 的观点 (角色: {role})...")
                model_start_time = time.time()
                
                try:
                    opinion = self.debate_chain.invoke({
                        "question": question,
                        "other_opinions": "\n".join(opinions),
                        "role": role
                    })
                    model_time = time.time() - model_start_time
                    print(f"模型 {model['name']} 响应成功，用时: {model_time:.2f}秒")
                    opinions.append(f"【{model['name']}】\n{opinion.content}\n")
                except Exception as e:
                    print(f"模型 {model['name']} 响应失败: {str(e)}")
                    print(f"错误详情: {traceback.format_exc()}")
                    return f"模型 {model['name']} 响应出错: {str(e)}", "无法达成共识"
            
            print("\n正在生成最终共识...")
            consensus_start_time = time.time()
            final_consensus = self.consensus_chain.invoke({
                "all_opinions": "\n".join(opinions)
            })
            consensus_time = time.time() - consensus_start_time
            print(f"共识生成完成，用时: {consensus_time:.2f}秒")
            
            total_time = time.time() - start_time
            print(f"\n辩论完成，总用时: {total_time:.2f}秒")
            return "\n".join(opinions), final_consensus.content
            
        except Exception as e:
            print(f"辩论过程发生错误: {str(e)}")
            print(f"错误详情: {traceback.format_exc()}")
            return f"辩论过程出错: {str(e)}", "无法达成共识"

def create_interface(debate_system):
    """创建Gradio界面"""
    with gr.Blocks(title="三巨头辩论系统") as interface:
        gr.Markdown("""
        # 🤖 三巨头辩论系统
        ## 让三个顶级AI模型为您的问题展开专业辩论
        """)
        
        with gr.Row():
            question_input = gr.Textbox(
                label="请输入您的问题",
                placeholder="例如：西门子温控系统当前采样周期为2秒，是否值得改为4秒？",
                lines=3
            )
            
        with gr.Row():
            submit_btn = gr.Button("开始辩论", variant="primary")
            
        with gr.Row():
            opinions_box = gr.TextArea(
                label="专家意见",
                interactive=False,
                lines=10
            )
            
        with gr.Row():
            consensus_box = gr.TextArea(
                label="最终共识",
                interactive=False,
                lines=6
            )
            
        submit_btn.click(
            fn=debate_system.debate,
            inputs=[question_input],
            outputs=[opinions_box, consensus_box],
            api_name="debate"
        )
        
    return interface

if __name__ == "__main__":
    print("="*50)
    print("启动三巨头辩论系统")
    print("="*50)
    try:
        debate_system = ThreeGiantsDebate()
        interface = create_interface(debate_system)
        print("\n模型初始化和测试完成，启动Gradio界面...")
        interface.launch(share=True)
    except Exception as e:
        print(f"\n系统启动失败: {str(e)}")
        print(f"详细错误: {traceback.format_exc()}")