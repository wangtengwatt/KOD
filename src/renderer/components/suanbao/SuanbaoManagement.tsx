import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import type { SuanbaoLocalCalendarEvent, SuanbaoReminder, SuanbaoTodoItem } from '@shared/types/suanbao'
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getSuanbaoAssistantService, suanbaoRuntime } from '@/packages/suanbao/runtime'
import { useSuanbaoStore } from './suanbaoStore'

type Tab = 'todos' | 'reminders' | 'pomodoro' | 'calendar'
type EditEntity = SuanbaoTodoItem | SuanbaoReminder | SuanbaoLocalCalendarEvent | null

const toLocalInput = (value?: number) => {
  if (!value) return ''
  const date = new Date(value - new Date(value).getTimezoneOffset() * 60_000)
  return date.toISOString().slice(0, 16)
}

const fromLocalInput = (value: string) => (value ? new Date(value).getTime() : undefined)
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export function SuanbaoManagement() {
  const accountKey = useSuanbaoStore((state) => state.accountKey)
  const runtimeSnapshot = useSyncExternalStore(
    suanbaoRuntime.subscribe.bind(suanbaoRuntime),
    suanbaoRuntime.getSnapshot
  )
  const loadGeneration = useRef(0)
  const [tab, setTab] = useState<Tab>('todos')
  const [todos, setTodos] = useState<SuanbaoTodoItem[]>([])
  const [reminders, setReminders] = useState<SuanbaoReminder[]>([])
  const [events, setEvents] = useState<SuanbaoLocalCalendarEvent[]>([])
  const [pomodoros, setPomodoros] = useState<
    Awaited<ReturnType<ReturnType<typeof getSuanbaoAssistantService>['listPomodoros']>>
  >([])
  const [editing, setEditing] = useState<EditEntity>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmAction, setConfirmAction] = useState<null | { label: string; run: () => Promise<boolean> }>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const ready = runtimeSnapshot.accountKey === accountKey && runtimeSnapshot.initialized
  const load = useCallback(async () => {
    if (!ready) return
    const generation = ++loadGeneration.current
    setLoading(true)
    try {
      const currentService = getSuanbaoAssistantService(accountKey)
      const [nextTodos, nextReminders, nextPomodoros, nextEvents] = await Promise.all([
        currentService.listTodos(),
        currentService.listReminders(),
        currentService.listPomodoros(),
        currentService.listCalendarEvents(),
      ])
      if (generation !== loadGeneration.current) return
      setTodos(nextTodos)
      setReminders(nextReminders)
      setPomodoros(nextPomodoros)
      setEvents(nextEvents)
      setError('')
    } catch (reason) {
      if (generation === loadGeneration.current) setError(reason instanceof Error ? reason.message : '加载失败')
    } finally {
      if (generation === loadGeneration.current) setLoading(false)
    }
  }, [accountKey, ready])

  useEffect(() => {
    ++loadGeneration.current
    setTodos([])
    setReminders([])
    setPomodoros([])
    setEvents([])
    setEditing(null)
    setCreating(false)
    setConfirmAction(null)
    setError('')
    setLoading(true)
    void suanbaoRuntime.switchAccount(accountKey).catch((reason) => {
      setError(reason instanceof Error ? reason.message : '初始化失败')
      setLoading(false)
    })
  }, [accountKey])

  useEffect(() => {
    void load()
  }, [load])

  const runMutation = useCallback(
    async (mutation: (service: ReturnType<typeof getSuanbaoAssistantService>) => Promise<unknown>) => {
      if (busy) return false
      setBusy(true)
      try {
        await mutation(getSuanbaoAssistantService(accountKey))
        await load()
        setError('')
        return true
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '操作失败')
        return false
      } finally {
        setBusy(false)
      }
    },
    [accountKey, busy, load]
  )

  const openCreate = () => {
    setEditing(null)
    setCreating(true)
    setTitle('')
    setStart('')
    setEnd('')
    setNotes('')
  }

  const openEdit = (entity: EditEntity) => {
    if (!entity) return
    setEditing(entity)
    setCreating(false)
    setTitle(entity.title)
    if ('triggerAt' in entity) setStart(toLocalInput(entity.triggerAt))
    else if ('startsAt' in entity) {
      setStart(toLocalInput(entity.startsAt))
      setEnd(toLocalInput(entity.endsAt))
      setNotes(entity.notes || '')
    } else setStart(toLocalInput(entity.dueAt))
  }

  const closeForm = () => {
    setCreating(false)
    setEditing(null)
  }

  const save = async () => {
    if (!title.trim()) {
      setError('请输入标题')
      return
    }
    const saved = await runMutation(async (service) => {
      if (tab === 'todos') {
        if (editing && 'completed' in editing) {
          await service.updateTodo(editing.id, { title, dueAt: fromLocalInput(start) ?? null })
        } else await service.create({ kind: 'create-todo', title, dueAt: fromLocalInput(start) })
      } else if (tab === 'reminders') {
        const triggerAt = fromLocalInput(start)
        if (!triggerAt) throw new Error('请选择提醒时间')
        if (editing && 'triggerAt' in editing) await service.updateReminder(editing.id, { title, triggerAt })
        else await service.create({ kind: 'create-reminder', title, triggerAt, timezone: timezone() })
      } else if (tab === 'calendar') {
        const startsAt = fromLocalInput(start)
        const endsAt = fromLocalInput(end)
        if (!startsAt || !endsAt) throw new Error('请选择开始和结束时间')
        if (editing && 'startsAt' in editing) {
          await service.updateCalendarEvent(editing.id, { title, startsAt, endsAt, notes })
        } else {
          await service.create({
            kind: 'create-local-calendar-event',
            title,
            startsAt,
            endsAt,
            timezone: timezone(),
            notes,
          })
        }
      }
    })
    if (saved) closeForm()
  }

  const activePomodoro = pomodoros.find((item) => item.status === 'running' || item.status === 'paused')

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>任务与日程</Title>
        {tab !== 'pomodoro' && (
          <Button size="xs" leftSection={<IconPlus size={14} />} disabled={!ready || busy} onClick={openCreate}>
            新增
          </Button>
        )}
      </Group>
      <SegmentedControl
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        data={[
          { label: '待办', value: 'todos' },
          { label: '提醒', value: 'reminders' },
          { label: '番茄钟', value: 'pomodoro' },
          { label: '本地日程', value: 'calendar' },
        ]}
      />
      {error && <Text c="red">{error}</Text>}
      {loading && (
        <Group justify="center" py="lg">
          <Loader size="sm" />
        </Group>
      )}

      {!loading &&
        tab === 'todos' &&
        (todos.length ? (
          todos.map((todo) => (
            <Paper key={todo.id} withBorder p="sm">
              <Group justify="space-between">
                <Checkbox
                  checked={todo.completed}
                  label={todo.title}
                  onChange={(event) =>
                    void runMutation((service) =>
                      service.updateTodo(todo.id, { completed: event.currentTarget.checked })
                    )
                  }
                />
                <Group gap="xs">
                  {todo.dueAt && <Text size="xs">{new Date(todo.dueAt).toLocaleString()}</Text>}
                  <ActionIcon variant="subtle" onClick={() => openEdit(todo)}>
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() =>
                      setConfirmAction({
                        label: `删除待办“${todo.title}”？`,
                        run: () => runMutation((service) => service.deleteTodo(todo.id)),
                      })
                    }
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))
        ) : (
          <Text c="dimmed">暂无待办</Text>
        ))}

      {!loading &&
        tab === 'reminders' &&
        (reminders.length ? (
          reminders.map((reminder) => (
            <Paper key={reminder.id} withBorder p="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={600}>{reminder.title}</Text>
                  <Text size="xs">{new Date(reminder.triggerAt).toLocaleString()}</Text>
                </div>
                <Group gap="xs">
                  <Badge>{reminder.status}</Badge>
                  <ActionIcon variant="subtle" onClick={() => openEdit(reminder)}>
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() =>
                      setConfirmAction({
                        label: `删除提醒“${reminder.title}”？`,
                        run: () => runMutation((service) => service.deleteReminder(reminder.id)),
                      })
                    }
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))
        ) : (
          <Text c="dimmed">暂无提醒</Text>
        ))}

      {!loading && tab === 'pomodoro' && (
        <Paper withBorder p="md">
          {activePomodoro ? (
            <Stack>
              <Text fw={600}>{activePomodoro.phase === 'work' ? '专注中' : '休息中'}</Text>
              <Badge>{activePomodoro.status}</Badge>
              <Group>
                <Button
                  size="xs"
                  onClick={() =>
                    void runMutation((service) =>
                      activePomodoro.status === 'paused' ? service.resumePomodoro() : service.pausePomodoro()
                    )
                  }
                >
                  {activePomodoro.status === 'paused' ? '继续' : '暂停'}
                </Button>
                <Button size="xs" variant="light" onClick={() => void runMutation((service) => service.skipPomodoro())}>
                  跳过阶段
                </Button>
                <Button
                  size="xs"
                  color="red"
                  onClick={() =>
                    setConfirmAction({
                      label: '停止当前番茄钟？',
                      run: () => runMutation((service) => service.stopPomodoro()),
                    })
                  }
                >
                  停止
                </Button>
              </Group>
            </Stack>
          ) : (
            <Button
              onClick={() =>
                void runMutation((service) => service.create({ kind: 'start-pomodoro', durationMs: 25 * 60_000 }))
              }
            >
              开始 25 分钟番茄钟
            </Button>
          )}
        </Paper>
      )}

      {!loading &&
        tab === 'calendar' &&
        (events.length ? (
          events.map((event) => (
            <Paper key={event.id} withBorder p="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={600}>{event.title}</Text>
                  <Text size="xs">
                    {new Date(event.startsAt).toLocaleString()} – {new Date(event.endsAt).toLocaleString()}
                  </Text>
                </div>
                <Group gap="xs">
                  <ActionIcon variant="subtle" onClick={() => openEdit(event)}>
                    <IconPencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() =>
                      setConfirmAction({
                        label: `删除日程“${event.title}”？`,
                        run: () => runMutation((service) => service.deleteCalendarEvent(event.id)),
                      })
                    }
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))
        ) : (
          <Text c="dimmed">暂无本地日程</Text>
        ))}

      <Modal opened={creating || !!editing} onClose={closeForm} title={editing ? '编辑' : '新增'}>
        <Stack>
          <TextInput label="标题" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          {tab !== 'todos' && (
            <TextInput
              label={tab === 'reminders' ? '提醒时间' : '开始时间'}
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.currentTarget.value)}
            />
          )}
          {tab === 'todos' && (
            <TextInput
              label="截止时间（可选）"
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.currentTarget.value)}
            />
          )}
          {tab === 'calendar' && (
            <>
              <TextInput
                label="结束时间"
                type="datetime-local"
                value={end}
                onChange={(event) => setEnd(event.currentTarget.value)}
              />
              <Textarea label="备注" value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
            </>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeForm}>
              取消
            </Button>
            <Button loading={busy} onClick={() => void save()}>
              保存
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={!!confirmAction} onClose={() => !busy && setConfirmAction(null)} title="请确认">
        <Stack>
          <Text>{confirmAction?.label}</Text>
          <Group justify="flex-end">
            <Button variant="default" disabled={busy} onClick={() => setConfirmAction(null)}>
              取消
            </Button>
            <Button
              color="red"
              loading={busy}
              onClick={() => {
                const action = confirmAction
                if (!action) return
                void action.run().then((succeeded) => {
                  if (succeeded) setConfirmAction(null)
                })
              }}
            >
              确认
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}
