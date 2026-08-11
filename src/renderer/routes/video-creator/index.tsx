import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Checkbox,
	FileButton,
	Flex,
	Group,
	Paper,
	ScrollArea,
	Select,
	Stack,
	Text,
	Textarea,
	Title,
} from "@mantine/core";
import { ModelProviderEnum } from "@shared/types";
import {
	IconDownload,
	IconHistory,
	IconPlayerPause,
	IconPlayerPlay,
	IconRefresh,
	IconTrash,
	IconVideoPlus,
} from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Page from "@/components/layout/Page";
import useKodAIModels from "@/hooks/useKodAIModels";
import { useIsSmallScreen } from "@/hooks/useScreenChange";
import { getLogger } from "@/lib/utils";
import platform from "@/platform";
import { useProviderSettings } from "@/stores/settingsStore";
import * as toastActions from "@/stores/toastActions";
import {
	createVideoTask,
	deleteVideoTask,
	fetchVideoContent,
	fileToDataUrl,
	getVideoTask,
	getVideoTaskError,
	listVideoTasks,
	normalizeVideoError,
	saveVideoTask,
	type VideoTask,
	type VideoTaskStatus,
} from "@/features/video-creator/videoService";

const log = getLogger("video-creator");
const POLL_INTERVAL = 7_000;

export const Route = createFileRoute("/video-creator/")({
	component: VideoCreatorPage,
});

function VideoCreatorPage() {
	const { t } = useTranslation();
	const { kodAIVideoModels } = useKodAIModels();
	const isSmallScreen = useIsSmallScreen();
	const { providerSettings } = useProviderSettings(ModelProviderEnum.ChatboxAI);
	const [prompt, setPrompt] = useState("");
	const [model, setModel] = useState("");
	const [seconds, setSeconds] = useState("5");
	const [ratio, setRatio] = useState("16:9");
	const [resolution, setResolution] = useState("720p");
	const [watermark, setWatermark] = useState(false);
	const [firstFrame, setFirstFrame] = useState<File | null>(null);
	const [tasks, setTasks] = useState<VideoTask[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [waiting, setWaiting] = useState(false);
	const [videoUrl, setVideoUrl] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const videoUrlRef = useRef<string | null>(null);
	const recoveredTaskRef = useRef<string | null>(null);

	const config = useMemo(() => {
		if (!providerSettings?.apiHost || !providerSettings.apiKey) return null;
		return {
			apiHost: providerSettings.apiHost,
			apiKey: providerSettings.apiKey,
		};
	}, [providerSettings?.apiHost, providerSettings?.apiKey]);
	const activeTask = tasks.find((task) => task.id === activeId) || null;

	const replaceTask = useCallback((task: VideoTask) => {
		setTasks((current) => [
			task,
			...current.filter((item) => item.id !== task.id),
		]);
		void saveVideoTask(task).catch((error) =>
			log.error("Failed to save video task", error),
		);
	}, []);

	useEffect(() => {
		void listVideoTasks()
			.then((saved) => {
				setTasks(saved);
				const recoverable = saved.find(
					(task) => task.status === "queued" || task.status === "processing",
				);
				if (recoverable) setActiveId(recoverable.id);
			})
			.catch((error) => log.error("Failed to load video history", error));
	}, []);

	useEffect(() => {
		if (!model && kodAIVideoModels[0])
			setModel(kodAIVideoModels[0].modelId);
	}, [kodAIVideoModels, model]);

	useEffect(() => {
		return () => {
			abortRef.current?.abort();
			if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
		};
	}, []);

	const loadContent = useCallback(
		async (taskId: string) => {
			if (!config) return;
			try {
				const blob = await fetchVideoContent(config, taskId);
				if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
				const nextUrl = URL.createObjectURL(blob);
				videoUrlRef.current = nextUrl;
				setVideoUrl(nextUrl);
			} catch (error) {
				toastActions.add(normalizeVideoError(error));
			}
		},
		[config],
	);

	const waitForTask = useCallback(
		async (task: VideoTask) => {
			if (!config) return;
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			setWaiting(true);
			try {
				let current = task;
				while (
					!controller.signal.aborted &&
					(current.status === "queued" || current.status === "processing")
				) {
					const result = await getVideoTask(
						config,
						current.id,
						controller.signal,
					);
					current = {
						...current,
						status: result.status,
						error: getVideoTaskError(result),
						updatedAt: Date.now(),
					};
					replaceTask(current);
					if (current.status === "succeeded") {
						await loadContent(current.id);
						break;
					}
					if (current.status === "failed") break;
					await new Promise<void>((resolve, reject) => {
						const timer = setTimeout(resolve, POLL_INTERVAL);
						controller.signal.addEventListener(
							"abort",
							() => {
								clearTimeout(timer);
								reject(new DOMException("Stopped", "AbortError"));
							},
							{ once: true },
						);
					});
				}
			} catch (error) {
				if (!controller.signal.aborted)
					toastActions.add(normalizeVideoError(error));
			} finally {
				if (abortRef.current === controller) abortRef.current = null;
				setWaiting(false);
			}
		},
		[config, loadContent, replaceTask],
	);

	useEffect(() => {
		const recoverable = tasks.find(
			(task) => task.id === activeId && (task.status === "queued" || task.status === "processing"),
		);
		if (!config || !recoverable || recoveredTaskRef.current === recoverable.id) return;
		recoveredTaskRef.current = recoverable.id;
		void waitForTask(recoverable);
	}, [activeId, config, tasks, waitForTask]);

	const submit = useCallback(
		async (retryTask?: VideoTask) => {
			if (!config) {
				toastActions.add(
					t("Video Creator requires a configured Kod AI relay station."),
				);
				return;
			}
			const firstFrameDataUrl = retryTask?.firstFrameDataUrl || (firstFrame ? await fileToDataUrl(firstFrame) : undefined);
			const input = retryTask
				? {
						prompt: retryTask.prompt,
						model: retryTask.model,
						seconds: retryTask.seconds,
						ratio: retryTask.ratio,
						resolution: retryTask.resolution,
						watermark: retryTask.watermark,
						firstFrameDataUrl,
					}
				: {
						prompt,
						model,
						seconds,
						ratio,
						resolution,
						watermark,
						firstFrameDataUrl,
					};
			try {
				const result = await createVideoTask(config, input);
				const now = Date.now();
				const task: VideoTask = {
					id: result.id,
					prompt: input.prompt,
					model: input.model,
					seconds: input.seconds,
					ratio: input.ratio,
					resolution: input.resolution,
					watermark: input.watermark,
					firstFrameName: retryTask?.firstFrameName || firstFrame?.name,
					firstFrameDataUrl,
					status: result.status,
					error: getVideoTaskError(result),
					createdAt: now,
					updatedAt: now,
				};
				replaceTask(task);
				setActiveId(task.id);
				setVideoUrl(null);
				if (!retryTask) {
					setPrompt("");
					setFirstFrame(null);
				}
				if (task.status === "queued" || task.status === "processing")
					await waitForTask(task);
				else if (task.status === "succeeded") await loadContent(task.id);
			} catch (error) {
				toastActions.add(normalizeVideoError(error));
			}
		},
		[
			config,
			firstFrame,
			loadContent,
			model,
			prompt,
			ratio,
			replaceTask,
			resolution,
			seconds,
			t,
			waitForTask,
			watermark,
		],
	);

	const selectTask = useCallback(
		(task: VideoTask) => {
			abortRef.current?.abort();
			setActiveId(task.id);
			setVideoUrl(null);
			if (task.status === "succeeded") void loadContent(task.id);
		},
		[loadContent],
	);

	const handleDelete = useCallback(async (task: VideoTask) => {
		try {
			if (abortRef.current && task.id === activeId) abortRef.current.abort();
			await deleteVideoTask(task.id);
			setTasks((current) => current.filter((item) => item.id !== task.id));
			if (task.id === activeId) {
				setActiveId(null);
				setVideoUrl(null);
			}
		} catch (error) {
			toastActions.add(normalizeVideoError(error));
		}
	}, [activeId]);

	const stop = () => abortRef.current?.abort();
	const download = async () => {
		if (!videoUrl || !activeTask) return;
		try {
			const response = await fetch(videoUrl);
			const blob = await response.blob();
			await platform.exporter.exportBlob(`seedance-${activeTask.id}.mp4`, blob);
		} catch (error) {
			toastActions.add(normalizeVideoError(error));
		}
	};
	const statusColor: Record<VideoTaskStatus, string> = {
		queued: "gray",
		processing: "blue",
		succeeded: "green",
		failed: "red",
	};

	return (
		<Page title={t("Video Creator")}>
			<Flex
				h="100%"
				className="overflow-hidden"
				direction={{ base: "column", sm: "row" }}
			>
				<ScrollArea flex={1}>
					<Stack maw={860} mx="auto" p="lg" gap="lg">
						<Box>
							<Title order={2}>{t("Create a Seedance video")}</Title>
							<Text c="dimmed">
								{t("Generate from text or add one first-frame image.")}
							</Text>
						</Box>

						{activeTask && (
							<Paper withBorder radius="lg" p="md">
								<Stack>
									<Group justify="space-between">
										<Badge color={statusColor[activeTask.status]}>
											{t(activeTask.status)}
										</Badge>
										<Text size="xs" c="dimmed">
											{activeTask.id}
										</Text>
									</Group>
									<Text>{activeTask.prompt}</Text>
									{videoUrl && (
										<video
											src={videoUrl}
											controls
											className="w-full max-h-[480px] rounded-lg"
										/>
									)}
									{activeTask.error && <Text c="red">{activeTask.error}</Text>}
									<Group>
										{(activeTask.status === "queued" ||
											activeTask.status === "processing") &&
											(waiting ? (
												<Button
													variant="light"
													leftSection={<IconPlayerPause size={16} />}
													onClick={stop}
												>
													{t("Stop waiting")}
												</Button>
											) : (
												<Button
													variant="light"
													leftSection={<IconPlayerPlay size={16} />}
													onClick={() => void waitForTask(activeTask)}
												>
													{t("Continue waiting")}
												</Button>
											))}
										{activeTask.status === "failed" && (
											<Button
												variant="light"
												leftSection={<IconRefresh size={16} />}
												onClick={() => void submit(activeTask)}
											>
												{t("Retry")}
											</Button>
										)}
										{activeTask.status === "succeeded" && videoUrl && (
											<Button
												variant="light"
												leftSection={<IconDownload size={16} />}
												onClick={() => void download()}
											>
												{t("Download")}
											</Button>
										)}
									</Group>
								</Stack>
							</Paper>
						)}

						<Paper withBorder radius="lg" p="md">
							<Stack>
								<Textarea
									label={t("Prompt")}
									placeholder={t("Describe the video you want to create...") || ""}
									minRows={4}
									value={prompt}
									onChange={(event) => setPrompt(event.currentTarget.value)}
								/>
								<Select
									label={t("Model")}
									data={kodAIVideoModels.map((item) => ({
										value: item.modelId,
										label: item.nickname || item.modelId,
									}))}
									value={model}
									onChange={(value) => setModel(value || "")}
									placeholder={t("No video models available") || ""}
								/>
								<Flex gap="sm" wrap="wrap">
									<Select
										label={t("Duration")}
										data={["5", "10"]}
										value={seconds}
										onChange={(value) => setSeconds(value || "5")}
									/>
									<Select
										label={t("Aspect Ratio")}
										data={["16:9", "9:16", "1:1"]}
										value={ratio}
										onChange={(value) => setRatio(value || "16:9")}
									/>
									<Select
										label={t("Resolution")}
										data={["480p", "720p", "1080p"]}
										value={resolution}
										onChange={(value) => setResolution(value || "720p")}
									/>
								</Flex>
								<Group justify="space-between">
									<Group>
										<FileButton onChange={setFirstFrame} accept="image/*">
											{(props) => (
												<Button variant="light" {...props}>
													{t("First frame image")}
												</Button>
											)}
										</FileButton>
										{firstFrame && <Text size="sm">{firstFrame.name}</Text>}
									</Group>
									<Checkbox
										label={t("Watermark")}
										checked={watermark}
										onChange={(event) =>
											setWatermark(event.currentTarget.checked)
										}
									/>
								</Group>
								<Button
									leftSection={<IconVideoPlus size={18} />}
									disabled={!prompt.trim() || !model || waiting}
									onClick={() => void submit()}
								>
									{t("Create Video")}
								</Button>
							</Stack>
						</Paper>
					</Stack>
				</ScrollArea>

					{(!isSmallScreen || tasks.length > 0) && (
						<Paper
							withBorder
							w={{ base: "100%", sm: 300 }}
							h={{ base: 220, sm: "100%" }}
							radius={0}
						>
					<Group p="md">
						<IconHistory size={18} />
						<Text fw={600}>{t("History")}</Text>
					</Group>
					<ScrollArea h="calc(100% - 56px)">
						<Stack gap="xs" px="sm" pb="sm">
							{tasks.map((task) => (
								<Paper
									key={task.id}
									withBorder={task.id === activeId}
									p="sm"
									className="cursor-pointer"
									onClick={() => selectTask(task)}
								>
									<Group justify="space-between" wrap="nowrap">
										<Text size="sm" lineClamp={2}>
											{task.prompt}
										</Text>
											<Badge size="xs" color={statusColor[task.status]}>
												{task.status}
											</Badge>
											<ActionIcon
												variant="subtle"
												color="red"
												size="sm"
												onClick={(event) => {
													event.stopPropagation();
													void handleDelete(task);
												}}
											>
												<IconTrash size={14} />
											</ActionIcon>
									</Group>
								</Paper>
							))}
						</Stack>
					</ScrollArea>
						</Paper>
					)}
				</Flex>
		</Page>
	);
}
