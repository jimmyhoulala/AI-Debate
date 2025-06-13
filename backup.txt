import React, { useState } from 'react'
import AgentOrder from './components/AgentOrder'
import DebateChat from './components/DebateChat'

function App() {
  const [topic, setTopic] = useState('')
  const [topicId, setTopicId] = useState(null)
  const [agents, setAgents] = useState([
    { id: '1', name: '智能体1', avatar: '/src/assets/agent1.png' },
    { id: '2', name: '智能体2', avatar: '/src/assets/agent2.png' },
    { id: '3', name: '智能体3', avatar: '/src/assets/agent3.png' }
  ])

  const [phase, setPhase] = useState(null)
  const [dialogue, setDialogue] = useState([])
  const [loading, setLoading] = useState(false)

  // const [currentRound, setCurrentRound] = useState(1)
  // const [currentAgentIndex, setCurrentAgentIndex] = useState(0)

  const handleStartDebate = async () => {
    if (!topic.trim()) {
      alert('请输入辩题')
      return
    }
    setLoading(true)
    try {
      const resp = await fetch('http://localhost:3001/api/debate_1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          agents: agents.map((a, idx) => ({ name: a.name, order: idx + 1 }))
        })
      })
      const data = await resp.json()
      if (!resp.ok || !data.success) {
        throw new Error(data.error || '初始化失败')
      }
      const tid = data.topic_id
      setTopicId(tid)

      // 拉取第一轮对话内容
      const res2 = await fetch(`http://localhost:3001/api/dialogues?topic_id=${tid}`)
      const d2 = await res2.json()
      if (!res2.ok || !d2.success) throw new Error(d2.error || '拉取对话失败')
      setDialogue(d2.dialogue.map(item => ({
        name: item.name,
        avatar: agents.find(a => a.name === item.name)?.avatar,
        text: item.text,
        references: item.references
      })))
      setPhase('intro')
    } catch (err) {
      alert(`启动失败：${err.message}`)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // const handleNextPhase = () => {
  //   if (phase === 'intro') {
  //     setPhase('debate')
  //     // 还可继续加载更多回合
  //   } else if (phase === 'debate') {
  //     const summary = agents.map(a => ({
  //       name: a.name,
  //       avatar: a.avatar,
  //       text: `我总结认为……`,
  //     }))
  //     summary.push({
  //       name: '主持人',
  //       avatar: '/src/assets/host.png',
  //       text: '感谢各位参与，以下是我对整场辩论的总结……',
  //     })
  //     setDialogue(summary)
  //     setPhase('summary')
  //   } else if (phase === 'summary') {
  //     setPhase('done')
  //   }
  // }

  const handleNextPhase = async () => {
    if (phase === 'intro') {
      setLoading(true)
      try {
        const res = await fetch('http://localhost:3001/api/debate_2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            topic_id: topicId,
            agents: agents.map((a, idx) => ({ name: a.name, order: idx + 1 }))
          })
        })
        const d = await res.json()
        if (!res.ok || !d.success) throw new Error(d.error || '第二轮生成失败')
        const msgs = d.dialogues.map(item => ({
          name: item.name,
          avatar: agents.find(a => a.name === item.name)?.avatar,
          text: item.text,
          references: item.references
        }))
        setDialogue(msgs)
        setPhase('debate')
      } catch (err) {
        alert('第二轮错误: ' + err.message)
      } finally {
        setLoading(false)
      }
    } else if (phase === 'debate') {
      const summary = agents.map(a => ({
        name: a.name,
        avatar: a.avatar,
        text: `我总结认为……`,
      }))
      summary.push({
        name: '主持人',
        avatar: '/src/assets/host.png',
        text: '感谢各位参与，以下是我对整场辩论的总结……',
      })
      setDialogue(summary)
      setPhase('summary')
    } else if (phase === 'summary') {
      setPhase('done')
    }
  }

  // const handleNextPhase = async () => {
  //   if (phase === 'intro') {
  //   setPhase('debate');
  //   await fetchNextDebateMessage({ 
  //     debateRound: currentRound,
  //     agentIndex: currentAgentIndex
  //   });
  // } else if (phase === 'debate') {
  //     const summary = agents.map(a => ({
  //       name: a.name,
  //       avatar: a.avatar,
  //       text: `我总结认为……`,
  //     }));
  //     summary.push({
  //       name: '主持人',
  //       avatar: '/src/assets/host.png',
  //       text: '感谢各位参与，以下是我对整场辩论的总结……',
  //     });
  //     setDialogue(prev => [...prev, ...summary]);
  //     setPhase('summary');
  //   } else if (phase === 'summary') {
  //     setPhase('done');
  //   }
  // };

  // const fetchNextDebateMessage = async ({ debateRound, agentIndex }) => {
  //   setLoading(true);

  //   let round = debateRound;
  //   let index = agentIndex;
  //   let isComplete = false;

  //   for (let i = 0; i < 9 && !isComplete; i++) {
  //     try {
  //       const res = await fetch('http://localhost:3001/api/debate_2', {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json' },
  //         body: JSON.stringify({
  //           topic,
  //           topic_id: topicId,
  //           agents: agents.map((a, idx) => ({ name: a.name, order: idx + 1 })),
  //           current_debate_round: round,
  //           current_agent_index: index
  //         })
  //       });

  //       const data = await res.json();

  //       // 追加到已有发言之后
  //       setDialogue(prev => [
  //         ...prev,
  //         {
  //           id: `${Date.now()}-${data.dialogue.name}`,
  //           name: data.dialogue.name,
  //           avatar: agents.find(a => a.name === data.dialogue.name)?.avatar,
  //           text: data.dialogue.text,
  //           references: data.dialogue.references
  //         }
  //       ]);

  //       // 更新索引状态
  //       round = data.next_debate_round;
  //       index = data.next_agent_index;
  //       setCurrentRound(round);
  //       setCurrentAgentIndex(index);
  //       isComplete = data.is_complete;

  //       if (!isComplete) await new Promise(r => setTimeout(r, 1000));
  //     } catch (err) {
  //       console.error('发言生成错误:', err);
  //       alert('发言生成错误: ' + err.message);
  //       break;
  //     }
  //   }

  //   setLoading(false);
  //   if (isComplete) handleNextPhase();
  // };


  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ flex: 1, padding: 30, background: '#f7f9fc' }}>
        <h2>多智能体辩论系统</h2>
        <label>请输入辩题：</label>
        <input
          style={{ width:'100%',padding:8,margin:'10px 0 20px',border:'1px solid #ccc',borderRadius:6 }}
          type="text" value={topic} onChange={e=>setTopic(e.target.value)}
          placeholder="例如：是否应禁止燃油车销售？"
        />
        <h3 style={{ fontSize: '1rem' }}>
          智能体发言顺序（拖动头像调整）
        </h3>
        <AgentOrder agents={agents} setAgents={setAgents} />
        <button
          style={{
            marginTop:20,padding:'10px 20px',
            backgroundColor: loading?'#999':'#0066cc',
            color:'white',border:'none',borderRadius:6,
            cursor: loading?'not-allowed':'pointer'
          }}
          onClick={handleStartDebate}
          disabled={loading}
        >
          {loading ? '启动中...' : '开始第一轮立论'}
        </button>
      </div>
      <div style={{ flex:5,padding:30,background:'#fff',borderLeft:'1px solid #ddd',overflowY:'auto' }}>
        <h2>辩论区域</h2>
        {phase ? (
          <DebateChat phase={phase} dialogue={dialogue} onNext={handleNextPhase} />
        ) : (
          <p style={{ color:'#777' }}>点击“开始辩论”进入第一阶段</p>
        )}
      </div>
    </div>
  )
}

export default App