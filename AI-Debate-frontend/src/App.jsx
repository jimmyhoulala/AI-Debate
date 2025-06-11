import React, { useState } from 'react'
import AgentOrder from './components/AgentOrder'
import DebateChat from './components/DebateChat'

function App() {
  const [topic, setTopic] = useState('')
  const [agents, setAgents] = useState([
    { id: '1', name: '智能体1', avatar: '/src/assets/agent1.png' },
    { id: '2', name: '智能体2', avatar: '/src/assets/agent2.png' },
    { id: '3', name: '智能体3', avatar: '/src/assets/agent3.png' }
  ])

  const [phase, setPhase] = useState(null) // 'intro' | 'debate' | 'summary' | 'done'
  const [dialogue, setDialogue] = useState([])

  const handleStartDebate = () => {
    const intro = agents.map(agent => ({
      name: agent.name,
      avatar: agent.avatar,
      text: `我是${agent.name}，我认为……（立场陈述）`
    }))
    setDialogue(intro)
    setPhase('intro')
  }

  const handleNextPhase = () => {
    if (phase === 'intro') {
      const newDialogue = []
      for (let round = 1; round <= 3; round++) {
        agents.forEach(agent => {
          newDialogue.push({
            name: agent.name,
            avatar: agent.avatar,
            text: `第 ${round} 轮：${agent.name} 的观点是……（辩论内容）`
          })
        })
      }
      setDialogue(newDialogue)
      setPhase('debate')
    } else if (phase === 'debate') {
      const summary = agents.map(agent => ({
        name: agent.name,
        avatar: agent.avatar,
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

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* 左栏 */}
      <div style={{ flex: 1, padding: '30px', background: '#f7f9fc' }}>
        <h2 style={{ marginBottom: '10px' }}>多智能体辩论系统</h2>
        <label>请输入辩题：</label>
        <input
          style={{
            width: '100%',
            padding: '8px',
            margin: '10px 0 20px',
            border: '1px solid #ccc',
            borderRadius: '6px'
          }}
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="例如：是否应禁止燃油车销售？"
        />

        <h3 style={{ marginBottom: '10px' }}>智能体发言顺序（可拖动）</h3>
        <AgentOrder agents={agents} setAgents={setAgents} />

        <button
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
          onClick={handleStartDebate}
        >
          开始辩论
        </button>
      </div>

      {/* 右栏 */}
      <div style={{
        flex: 5,
        padding: '30px',
        backgroundColor: '#ffffff',
        borderLeft: '1px solid #ddd',
        overflowY: 'auto'
      }}>

        <h2 style={{ marginBottom: '15px' }}>辩论区域</h2>

        {phase ? (
          <DebateChat
            phase={phase}
            dialogue={dialogue}
            onNext={handleNextPhase}
          />
        ) : (
          <p style={{ color: '#777' }}>点击“开始辩论”进入第一阶段</p>
        )}
      </div>
    </div>
  )
}

export default App
