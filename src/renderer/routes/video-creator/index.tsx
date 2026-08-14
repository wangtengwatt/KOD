import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Container,
  FileInput,
  Flex,
  Group,
  Image,
  Loader,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core'
import type { VideoGeneration } from '@shared/types'
import {
  IconDownload,
  IconHistory,
  IconMovie,
  IconPhotoPlus,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import Page from '@/components/layout/Page'
import { useBlob } from '@/hooks/useBlob'
import { getVideoServiceErrorMessage, isVideoCopyrightRestriction } from '@/packages/model-calls/generate-video'
import { KOD_VIDEO_MODELS, KOD_VIDEO_PROVIDER_ID } from '@/packages/model-calls/kod-video'
import platform from '@/platform'
import storage from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import { useAuthInfoStore } from '@/stores/authInfoStore'
import {
  createAndGenerateVideo,
  retryVideoGeneration,
  VideoBalanceInsufficientError,
  VideoLoginRequiredError,
} from '@/stores/videoGenerationActions'
import {
  deleteVideoRecord,
  selectVideoRecord,
  useCurrentGeneratingId,
  useCurrentVideoRecordId,
  useVideoGenerationHistory,
  useVideoGenerationRecord,
} from '@/stores/videoGenerationStore'

export const Route = createFileRoute('/video-creator/')({
  component: VideoCreatorPage,
})

const MAX_REFERENCE_IMAGES = 2
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024
const ORIGINAL_VIDEO_PROMPT_EXAMPLE =
  '一位原创的银色能量守护者在现代滨水城市与一台原创重型工程机甲展开对决，电影感广角镜头，动态光影，不包含任何现有影视、动漫或游戏角色。'

interface ReferenceImage {
  storageKey: string
  name: string
}

function VideoCreatorPage() {
  const isLoggedIn = useAuthInfoStore((state) => Boolean(state.accessToken))
  const [prompt, setPrompt] = useState('')
  const [modelId, setModelId] = useState<string>(KOD_VIDEO_MODELS[0].value)
  const [duration, setDuration] = useState<5 | 10>(5)
  const [resolution, setResolution] = useState<'480p' | '720p'>('720p')
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const ownedReferenceKeys = useRef(new Set<string>())
  const promptInputRef = useRef<HTMLTextAreaElement>(null)

  const currentGeneratingId = useCurrentGeneratingId()
  const currentRecordId = useCurrentVideoRecordId()
  const currentRecordQuery = useVideoGenerationRecord(currentRecordId)
  const historyQuery = useVideoGenerationHistory()
  const currentRecord = currentRecordQuery.data

  useEffect(() => {
    return () => {
      for (const key of ownedReferenceKeys.current) void storage.delBlob(key).catch(() => undefined)
    }
  }, [])

  const handleImageUpload = useCallback(
    async (files: File[]) => {
      setFormError(null)
      const available = MAX_REFERENCE_IMAGES - referenceImages.length
      const accepted = files.slice(0, available)
      for (const file of accepted) {
        if (!file.type.startsWith('image/')) {
          setFormError('只能上传图片文件。')
          continue
        }
        if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
          setFormError(`图片 ${file.name} 超过 10 MB，请压缩后重试。`)
          continue
        }
        try {
          const dataUrl = await readFileAsDataUrl(file)
          const storageKey = StorageKeyGenerator.picture('video-creator-ref')
          await storage.setBlob(storageKey, dataUrl)
          ownedReferenceKeys.current.add(storageKey)
          setReferenceImages((current) => [...current, { storageKey, name: file.name }].slice(0, MAX_REFERENCE_IMAGES))
        } catch (error) {
          setFormError(error instanceof Error ? `图片读取失败：${error.message}` : '图片读取失败，请重新选择。')
        }
      }
    },
    [referenceImages.length]
  )

  const removeReference = useCallback((storageKey: string) => {
    setReferenceImages((current) => current.filter((item) => item.storageKey !== storageKey))
    ownedReferenceKeys.current.delete(storageKey)
    void storage.delBlob(storageKey).catch(() => undefined)
  }, [])

  const handleGenerate = useCallback(async () => {
    setFormError(null)
    if (!prompt.trim()) {
      setFormError('请先填写视频内容描述。')
      return
    }
    try {
      await createAndGenerateVideo({
        prompt: prompt.trim(),
        referenceImages: referenceImages.map((item) => item.storageKey),
        model: { provider: KOD_VIDEO_PROVIDER_ID, modelId },
        duration,
        resolution,
        ratio: '16:9',
      })
      for (const item of referenceImages) ownedReferenceKeys.current.delete(item.storageKey)
      setReferenceImages([])
    } catch (error) {
      if (error instanceof VideoLoginRequiredError || error instanceof VideoBalanceInsufficientError) {
        setFormError(error.message)
      } else {
        setFormError(error instanceof Error ? error.message : '无法开始生成视频。')
      }
    }
  }, [duration, modelId, prompt, referenceImages, resolution])

  const useOriginalPromptExample = useCallback(() => {
    setPrompt(ORIGINAL_VIDEO_PROMPT_EXAMPLE)
    setFormError(null)
    requestAnimationFrame(() => promptInputRef.current?.focus())
  }, [])

  return (
    <Page title="生成视频">
      <Container size="xl" py="md" h="100%">
        <Stack h="100%" gap="md">
          <Box>
            <Group gap="xs">
              <IconMovie size={26} />
              <Title order={2}>生成视频</Title>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              支持纯文字生成和参考图生成，可选 5/10 秒与 480p/720p。视频结果保存在本机。
            </Text>
          </Box>

          {!isLoggedIn && (
            <Alert color="blue" title="需要登录">
              官方视频通道需要登录 KOD 账号。未登录只会停用本页面，不影响聊天、图片生成或其他功能。
            </Alert>
          )}
          {formError && (
            <Alert color="red" title="暂时无法生成" withCloseButton onClose={() => setFormError(null)}>
              {formError} 此问题只影响视频生成，其他功能可以继续使用。
            </Alert>
          )}

          <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md" className="min-h-0 flex-1">
            <Stack gap="md" className="lg:col-span-2 min-h-0">
              <Card withBorder radius="lg" padding="lg">
                <Stack gap="md">
                  <Textarea
                    ref={promptInputRef}
                    label="视频内容描述"
                    placeholder="例如：清晨云海之上，镜头缓慢推进，一轮日出照亮远处山峰……"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    minRows={4}
                    autosize
                  />

                  <FileInput
                    label="参考图片（可选）"
                    description="不上传即为文生视频；最多上传 2 张图片，单张不超过 10 MB。"
                    accept="image/*"
                    multiple
                    clearable
                    leftSection={<IconPhotoPlus size={16} />}
                    onChange={(files) => void handleImageUpload(files)}
                    disabled={referenceImages.length >= MAX_REFERENCE_IMAGES}
                  />

                  {referenceImages.length > 0 && (
                    <Flex gap="sm" wrap="wrap">
                      {referenceImages.map((image) => (
                        <ReferenceImagePreview key={image.storageKey} image={image} onRemove={removeReference} />
                      ))}
                    </Flex>
                  )}

                  <SimpleGrid cols={{ base: 1, sm: 3 }}>
                    <Select
                      label="视频模型"
                      data={[...KOD_VIDEO_MODELS]}
                      value={modelId}
                      onChange={(value) => value && setModelId(value)}
                    />
                    <Box>
                      <Text size="sm" fw={500} mb={5}>
                        时长
                      </Text>
                      <SegmentedControl
                        fullWidth
                        value={String(duration)}
                        data={[
                          { value: '5', label: '5 秒' },
                          { value: '10', label: '10 秒' },
                        ]}
                        onChange={(value) => setDuration(Number(value) as 5 | 10)}
                      />
                    </Box>
                    <Box>
                      <Text size="sm" fw={500} mb={5}>
                        画质
                      </Text>
                      <SegmentedControl
                        fullWidth
                        value={resolution}
                        data={[
                          { value: '480p', label: '480p' },
                          { value: '720p', label: '720p' },
                        ]}
                        onChange={(value) => setResolution(value as '480p' | '720p')}
                      />
                    </Box>
                  </SimpleGrid>

                  <Button
                    size="md"
                    leftSection={
                      currentGeneratingId ? <Loader size={16} color="white" /> : <IconPlayerPlay size={18} />
                    }
                    loading={Boolean(currentGeneratingId)}
                    disabled={!isLoggedIn || !prompt.trim() || Boolean(currentGeneratingId)}
                    onClick={() => void handleGenerate()}
                  >
                    {referenceImages.length ? '根据图片生成视频' : '根据文字生成视频'}
                  </Button>
                </Stack>
              </Card>

              <CurrentVideoResult
                record={currentRecord}
                generating={Boolean(currentGeneratingId)}
                onError={setFormError}
                onUseOriginalPrompt={useOriginalPromptExample}
              />
            </Stack>

            <Card withBorder radius="lg" padding="md" className="min-h-0">
              <Group justify="space-between" mb="sm">
                <Group gap="xs">
                  <IconHistory size={18} />
                  <Text fw={600}>本地历史</Text>
                </Group>
                <ActionIcon variant="subtle" onClick={() => void historyQuery.refetch()} aria-label="刷新历史">
                  <IconRefresh size={16} />
                </ActionIcon>
              </Group>
              <ScrollArea h={{ base: 300, lg: 590 }}>
                <Stack gap="xs">
                  {historyQuery.isLoading && <Loader size="sm" />}
                  {!historyQuery.isLoading && !historyQuery.data?.length && (
                    <Text size="sm" c="dimmed">
                      暂无视频生成记录
                    </Text>
                  )}
                  {historyQuery.data?.map((record) => (
                    <HistoryRecord key={record.id} record={record} selected={record.id === currentRecordId} />
                  ))}
                </Stack>
              </ScrollArea>
            </Card>
          </SimpleGrid>
        </Stack>
      </Container>
    </Page>
  )
}

function CurrentVideoResult({
  record,
  generating,
  onError,
  onUseOriginalPrompt,
}: {
  record?: VideoGeneration | null
  generating: boolean
  onError: (message: string) => void
  onUseOriginalPrompt: () => void
}) {
  if (!record) {
    return (
      <Card withBorder radius="lg" padding="xl">
        <Stack align="center" py="xl" gap="xs">
          <IconMovie size={42} opacity={0.35} />
          <Text c="dimmed">生成结果将在这里在线播放</Text>
        </Stack>
      </Card>
    )
  }

  const copyrightRestricted = isVideoCopyrightRestriction(record.error || '')
  const displayError = record.error ? getVideoServiceErrorMessage(record.error) : '视频生成失败，请稍后重试。'

  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack gap="md">
        <Group justify="space-between">
          <Box>
            <Text fw={600}>{record.prompt}</Text>
            <Text size="xs" c="dimmed">
              {record.duration} 秒 · {record.resolution} · {record.referenceImages.length ? '图生视频' : '文生视频'}
            </Text>
          </Box>
          <StatusBadge status={record.status} />
        </Group>

        {(record.status === 'pending' || record.status === 'generating' || generating) && (
          <Stack gap={5}>
            <Progress value={record.progress ?? 5} animated />
            <Text size="xs" c="dimmed">
              视频生成通常需要数分钟，可以停留在本页等待。
            </Text>
          </Stack>
        )}

        {record.status === 'error' && (
          <Alert color="red" title={copyrightRestricted ? '内容未通过版权检查' : '视频服务暂不可用'}>
            <Stack gap="sm">
              <Text size="sm">{displayError}</Text>
              <Text size="xs">
                {copyrightRestricted
                  ? '这是上游内容审核结果，不是程序或合并故障；原样重试仍会失败。'
                  : '该错误已隔离，只影响本次视频任务。'}
              </Text>
              {copyrightRestricted ? (
                <Button size="xs" variant="light" w="fit-content" onClick={onUseOriginalPrompt}>
                  使用原创示例重新填写
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="light"
                  w="fit-content"
                  onClick={() => {
                    void retryVideoGeneration(record.id).catch((error) =>
                      onError(error instanceof Error ? error.message : '无法重试视频任务。')
                    )
                  }}
                >
                  重试本任务
                </Button>
              )}
            </Stack>
          </Alert>
        )}

        {record.status === 'done' && record.generatedVideos.map((video) => <VideoPlayer key={video} value={video} />)}
      </Stack>
    </Card>
  )
}

function VideoPlayer({ value }: { value: string }) {
  const isUrl = /^https?:\/\//.test(value)
  const blobQuery = useBlob(isUrl ? undefined : value)
  const source = isUrl ? value : blobQuery.data || undefined

  const download = () => {
    if (!source) return
    void platform.exporter.exportByUrl(`kod-video-${Date.now()}.mp4`, source)
  }

  if (!source) return <Loader size="sm" />
  return (
    <Box pos="relative">
      <video
        src={source}
        controls
        playsInline
        style={{ display: 'block', width: '100%', maxHeight: 520, borderRadius: 10 }}
      />
      <Button
        size="xs"
        variant="white"
        pos="absolute"
        top={10}
        right={10}
        leftSection={<IconDownload size={15} />}
        onClick={download}
      >
        下载
      </Button>
    </Box>
  )
}

function ReferenceImagePreview({ image, onRemove }: { image: ReferenceImage; onRemove: (storageKey: string) => void }) {
  const blobQuery = useBlob(image.storageKey)
  return (
    <Box pos="relative" w={92}>
      <Image src={blobQuery.data || undefined} h={72} radius="md" fit="cover" alt={image.name} />
      <ActionIcon
        size="xs"
        color="red"
        variant="filled"
        radius="xl"
        pos="absolute"
        top={-5}
        right={-5}
        onClick={() => onRemove(image.storageKey)}
        aria-label="移除参考图片"
      >
        <IconX size={12} />
      </ActionIcon>
      <Text size="xs" truncate mt={3}>
        {image.name}
      </Text>
    </Box>
  )
}

function HistoryRecord({ record, selected }: { record: VideoGeneration; selected: boolean }) {
  return (
    <Card withBorder padding="sm" radius="md" bg={selected ? 'var(--chatbox-background-brand-secondary)' : undefined}>
      <Stack gap={5}>
        <Flex justify="space-between" gap="xs" align="flex-start">
          <Text
            size="sm"
            fw={500}
            lineClamp={2}
            style={{ cursor: 'pointer' }}
            onClick={() => selectVideoRecord(record.id)}
          >
            {record.prompt}
          </Text>
          <ActionIcon
            color="red"
            variant="subtle"
            size="sm"
            onClick={() => void deleteVideoRecord(record.id)}
            aria-label="删除历史"
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Flex>
        <Group justify="space-between" gap="xs">
          <Text size="xs" c="dimmed">
            {new Date(record.createdAt).toLocaleString()} · {record.duration}s · {record.resolution}
          </Text>
          <StatusBadge status={record.status} />
        </Group>
      </Stack>
    </Card>
  )
}

function StatusBadge({ status }: { status: VideoGeneration['status'] }) {
  const config = {
    pending: { color: 'gray', label: '等待中' },
    generating: { color: 'blue', label: '生成中' },
    done: { color: 'green', label: '已完成' },
    error: { color: 'red', label: '失败' },
  }[status]
  return (
    <Badge size="xs" color={config.color} variant="light">
      {config.label}
    </Badge>
  )
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
