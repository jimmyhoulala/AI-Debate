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

// 可选角色列表（不可重复）
const allRoles = [
  '环保主义者',
  '政策制定者',
  '经济学家',
  '技术乐观主义者',
  '哲学评论者'
]

function AgentCard({ agent, index, onRoleChange, usedRoles }) {
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
    <div ref={setNodeRef} style={style} {...attributes}>
      <div {...listeners}>
        <img
          src={agent.avatar}
          alt="avatar"
          style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            objectFit: 'cover',
            cursor: 'grab'
          }}
        />
      </div>

      <select
        value={agent.name}
        onChange={(e) => onRoleChange(index, e.target.value)}
        style={{
          flexGrow: 1,
          fontSize: '16px',
          border: '1px solid #ddd',
          padding: '6px',
          borderRadius: '4px',
          backgroundColor: '#f9f9f9',
          outline: 'none'
        }}
      >
        <option value="">请选择角色</option>
        {allRoles.map(role => (
          <option
            key={role}
            value={role}
            disabled={usedRoles.includes(role) && role !== agent.name}
          >
            {role}
          </option>
        ))}
      </select>
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
      const newAgents = arrayMove(agents, oldIndex, newIndex)
      setAgents(newAgents)
    }
  }

  const handleRoleChange = (index, newRole) => {
    const updated = [...agents]
    updated[index].name = newRole
    setAgents(updated)
  }

  const usedRoles = agents.map(a => a.name).filter(n => n !== '')

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
            onRoleChange={handleRoleChange}
            usedRoles={usedRoles}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}

export default AgentOrder
