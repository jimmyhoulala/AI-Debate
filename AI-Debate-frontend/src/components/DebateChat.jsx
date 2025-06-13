import React, { useEffect, useState } from 'react'

function TypingMessage({ msg, index, isLeft, onFinish }) {
  const [displayText, setDisplayText] = useState('')

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      setDisplayText(msg.text.slice(0, i))
      i++
      if (i > msg.text.length) {
        clearInterval(interval)
        onFinish()
      }
    }, 30)
    return () => clearInterval(interval)
  }, [msg.text, onFinish])

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isLeft ? 'flex-start' : 'flex-end',
        width: '100%'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          flexDirection: isLeft ? 'row' : 'row-reverse',
          gap: '10px',
          width: 'fit-content',
          maxWidth: '90%',
          alignSelf: isLeft ? 'flex-start' : 'flex-end',
          margin: '4px 0',
          paddingLeft: isLeft ? '0' : '650px',
          paddingRight: isLeft ? '650px' : '0',
        }}
      >
        <img
          src={msg.avatar}
          alt="avatar"
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            flexShrink: 0
          }}
        />
        <div
          style={{
            backgroundColor: isLeft ? '#f0f0f0' : '#cce5ff',
            padding: '10px 14px',
            borderRadius: '12px',
            fontSize: '15px',
            lineHeight: '1.4',
            whiteSpace: 'pre-wrap',
            textAlign: 'left',
            borderLeft: msg.isSummary ? '4px solid #4CAF50' : 'none'
          }}
        >
          <strong>{msg.name}{msg.isSummary ? '的总结' : ''}：</strong> {displayText}
        </div>
      </div>
    </div>
  )
}

function DebateChat({ phase, dialogue, onNext }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const isFinished = currentIndex >= dialogue.length

  useEffect(() => {
    setCurrentIndex(0)
  }, [dialogue])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {dialogue.slice(0, currentIndex).map((msg, i) => {
        const isLeft = i % 2 === 0
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: isLeft ? 'flex-start' : 'flex-end'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                flexDirection: isLeft ? 'row' : 'row-reverse',
                gap: '10px',
                width: 'fit-content',
                maxWidth: '90%',
                alignSelf: isLeft ? 'flex-start' : 'flex-end',
                paddingLeft: isLeft ? '0' : '650px',
                paddingRight: isLeft ? '650px' : '0',
              }}
            >
              <img
                src={msg.avatar}
                alt="avatar"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  flexShrink: 0
                }}
              />
              <div
                style={{
                  backgroundColor: isLeft ? '#f0f0f0' : '#cce5ff',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontSize: '15px',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-wrap',
                  textAlign: 'left',
                  borderLeft: msg.isSummary ? '4px solid #4CAF50' : 'none'
                }}
              >
                <strong>{msg.name}{msg.isSummary ? '的总结' : ''}：</strong> {msg.text}
              </div>
            </div>
          </div>
        )
      })}

      {!isFinished && (
        <TypingMessage
          msg={dialogue[currentIndex]}
          index={currentIndex}
          isLeft={currentIndex % 2 === 0}
          onFinish={() => setCurrentIndex(currentIndex + 1)}
        />
      )}

      {isFinished && (
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            onClick={onNext}
            style={{
              padding: '10px 20px',
              fontSize: '15px',
              backgroundColor: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {phase === 'intro'
              ? '进入辩论阶段'
              : phase === 'debate'
              ? '进入总结阶段'
              : '完成辩论'}
          </button>
        </div>
      )}
    </div>
  )
}

export default DebateChat