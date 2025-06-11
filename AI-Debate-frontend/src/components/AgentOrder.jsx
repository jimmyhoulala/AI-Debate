import React from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'

import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'

import { CSS } from '@dnd-kit/utilities'

function AgentCard({ agent, index, onNameChange }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition
  } = useSortable({ id: agent.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    marginBottom: '12px',
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    borderRadius: '10px',
    boxShadow: '2px 2px 6px rgba(0,0,0,0.05)',
    minHeight: '70px'
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <img
        src={agent.avatar}
        alt="avatar"
        style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          objectFit: 'cover'
        }}
      />
      <input
        type="text"
        value={agent.name}
        onChange={(e) => onNameChange(index, e.target.value)}
        style={{
          flexGrow: 1,
          fontSize: '16px',
          border: 'none',
          background: 'transparent',
          outline: 'none'
        }}
      />
    </div>
  )
}


function AgentOrder({ agents, setAgents }) {
  const sensors = useSensors(useSensor(PointerSensor))

  const handleDragEnd = (event) => {
    const { active, over } = event
    if (active.id !== over.id) {
      const oldIndex = agents.findIndex((a) => a.id === active.id)
      const newIndex = agents.findIndex((a) => a.id === over.id)
      setAgents((items) => arrayMove(items, oldIndex, newIndex))
    }
  }

  const handleNameChange = (index, newName) => {
    const updated = [...agents]
    updated[index].name = newName
    setAgents(updated)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={agents.map((a) => a.id)}
        strategy={verticalListSortingStrategy}
      >
        {agents.map((agent, index) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            index={index}
            onNameChange={handleNameChange}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}

export default AgentOrder
