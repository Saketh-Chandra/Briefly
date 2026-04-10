import React, { useState } from 'react'
import type { Todo } from '../../../main/lib/types'

interface TodoListProps {
  meetingId: number
  todos: Todo[]
}

const priorityDot: Record<Todo['priority'], string> = {
  high:   'bg-red-500',
  medium: 'bg-yellow-500',
  low:    'bg-green-500',
}

export default function TodoList({ meetingId, todos: initialTodos }: TodoListProps): React.JSX.Element {
  const [todos, setTodos] = useState<Todo[]>(initialTodos)

  async function toggle(index: number): Promise<void> {
    const updated = todos.map((t, i) => i === index ? { ...t, done: !t.done } : t)
    setTodos(updated)
    await window.api.updateTodo(meetingId, index, updated[index].done)
  }

  if (todos.length === 0) {
    return <p className="text-sm text-muted-foreground">No action items found.</p>
  }

  return (
    <ul className="flex flex-col gap-3">
      {todos.map((todo, i) => (
        <li key={i} className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={todo.done}
            onChange={() => void toggle(i)}
            className="mt-0.5 h-4 w-4 cursor-pointer rounded accent-primary"
          />
          <div className="min-w-0 flex-1">
            <p className={`text-sm leading-snug ${todo.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {todo.text}
            </p>
            <div className="mt-1 flex items-center gap-2">
              {todo.owner && (
                <span className="text-[10px] text-muted-foreground">{todo.owner}</span>
              )}
              {todo.deadline && (
                <span className="text-[10px] text-muted-foreground">Due {todo.deadline}</span>
              )}
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${priorityDot[todo.priority]}`} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
