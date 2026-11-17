import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { fieldProperties, operationProperties, resourceProperty } from './descriptions';
import {
	clipUgcApiRequest,
	recordingExtension,
	uploadHeaders,
	waitUntilCompleted,
	type WaitSettings,
} from './GenericFunctions';

const PAGE_SIZE = 50;

function readWaitSettings(context: IExecuteFunctions, itemIndex: number): WaitSettings | null {
	if (!(context.getNodeParameter('waitForCompletion', itemIndex, true) as boolean)) {
		return null;
	}
	return {
		pollInterval: context.getNodeParameter('pollInterval', itemIndex, 10) as number,
		maxWait: context.getNodeParameter('maxWait', itemIndex, 600) as number,
	};
}

async function getCredits(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	return [(await clipUgcApiRequest(context, 'GET', '/credits', itemIndex)) as IDataObject];
}

async function createAiInfluencer(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const additional = context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const body: IDataObject = {
		description: context.getNodeParameter('description', itemIndex) as string,
	};
	if (additional.scenePrompt) {
		body.scene_prompt = additional.scenePrompt;
	}
	if (additional.isPublic !== undefined) {
		body.is_public = additional.isPublic;
	}

	const created = (await clipUgcApiRequest(
		context,
		'POST',
		'/ai-characters',
		itemIndex,
		body,
	)) as IDataObject;

	const looks = (created.reference_images ?? []) as IDataObject[];
	let look: IDataObject | undefined = looks[0];
	const wait = readWaitSettings(context, itemIndex);
	if (look && wait) {
		look = await waitUntilCompleted(
			context,
			`/character-images/${String(look.id)}/check-status`,
			'look',
			wait,
			itemIndex,
		);
		created.reference_images = [look, ...looks.slice(1)];
	}

	return [{ ...created, look_id: look?.id ?? null, look_status: look?.status ?? null }];
}

async function getManyAiInfluencers(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const returnAll = context.getNodeParameter('returnAll', itemIndex, false) as boolean;
	const limit = returnAll ? Infinity : (context.getNodeParameter('limit', itemIndex, 50) as number);
	const filters = context.getNodeParameter('filters', itemIndex, {}) as IDataObject;
	const qs: IDataObject = {
		scope: context.getNodeParameter('scope', itemIndex, 'discover') as string,
		per_page: PAGE_SIZE,
	};
	if (filters.search) {
		qs.search = filters.search;
	}

	const results: IDataObject[] = [];
	let page = 1;
	let hasMore = true;
	while (hasMore && results.length < limit) {
		const data = (await clipUgcApiRequest(context, 'GET', '/ai-characters', itemIndex, undefined, {
			...qs,
			page,
		})) as IDataObject;
		const rows = (data.ai_characters ?? []) as IDataObject[];
		for (const row of rows) {
			const cover = row.cover_image as IDataObject | null | undefined;
			// `look_id` is the picture a clip can be made from, ready for Clip > Create.
			results.push({ ...row, look_id: cover?.id ?? null });
		}
		hasMore = Boolean((data.pagination as IDataObject | undefined)?.has_more_pages) && rows.length > 0;
		page++;
	}

	return returnAll ? results : results.slice(0, limit);
}

async function generateLook(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const aiInfluencerId = context.getNodeParameter('aiInfluencerId', itemIndex) as number;
	const scenePrompt = context.getNodeParameter('scenePrompt', itemIndex, '') as string;
	const body: IDataObject = {};
	if (scenePrompt) {
		body.scene_prompt = scenePrompt;
	}

	const started = (await clipUgcApiRequest(
		context,
		'POST',
		`/ai-characters/${aiInfluencerId}/reference-images`,
		itemIndex,
		body,
	)) as IDataObject[];

	const wait = readWaitSettings(context, itemIndex);
	const looks: IDataObject[] = [];
	for (const look of started) {
		const current = wait
			? await waitUntilCompleted(
					context,
					`/character-images/${String(look.id)}/check-status`,
					'look',
					wait,
					itemIndex,
				)
			: look;
		looks.push({ ...current, look_id: current.id });
	}
	return looks;
}

async function getLook(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const lookId = context.getNodeParameter('lookId', itemIndex) as number;
	const look = (await clipUgcApiRequest(
		context,
		'GET',
		`/character-images/${lookId}/check-status`,
		itemIndex,
	)) as IDataObject;
	return [{ ...look, look_id: look.id }];
}

async function createClip(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const additional = context.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
	const prompt = context.getNodeParameter('prompt', itemIndex, '') as string;
	const body: IDataObject = {
		character_reference_image_id: context.getNodeParameter('lookId', itemIndex) as number,
		duration: context.getNodeParameter('duration', itemIndex, 5) as number,
	};
	if (prompt) {
		body.prompt = prompt;
	}
	if (additional.scenePrompt) {
		body.scene_prompt = additional.scenePrompt;
	}

	const clip = (await clipUgcApiRequest(
		context,
		'POST',
		'/character-videos/image-to-video',
		itemIndex,
		body,
	)) as IDataObject;

	const wait = readWaitSettings(context, itemIndex);
	if (!wait) {
		return [clip];
	}
	return [
		await waitUntilCompleted(
			context,
			`/character-videos/${String(clip.id)}/check-status`,
			'clip',
			wait,
			itemIndex,
		),
	];
}

async function getClip(context: IExecuteFunctions, itemIndex: number): Promise<IDataObject[]> {
	const clipId = context.getNodeParameter('clipId', itemIndex) as number;
	return [
		(await clipUgcApiRequest(
			context,
			'GET',
			`/character-videos/${clipId}/check-status`,
			itemIndex,
		)) as IDataObject,
	];
}

/** A completed finished video also gets `download_url`, a signed link that works for 30 minutes. */
async function withDownloadUrl(
	context: IExecuteFunctions,
	video: IDataObject,
	itemIndex: number,
): Promise<IDataObject> {
	if (video.status !== 'completed') {
		return { ...video, download_url: null };
	}
	const download = (await clipUgcApiRequest(
		context,
		'GET',
		`/merged-videos/${String(video.id)}/download`,
		itemIndex,
	)) as IDataObject;
	return { ...video, download_url: download.download_url ?? null };
}

async function loadRecording(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<{ file: Buffer; extension: string; mimeType: string }> {
	const source = context.getNodeParameter('recordingSource', itemIndex, 'url') as string;

	if (source === 'binary') {
		const field = context.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
		const meta = context.helpers.assertBinaryData(itemIndex, field);
		const file = await context.helpers.getBinaryDataBuffer(itemIndex, field);
		return {
			file,
			extension: recordingExtension(meta.fileName ?? '', meta.mimeType),
			mimeType: meta.mimeType || 'video/mp4',
		};
	}

	const url = (context.getNodeParameter('recordingUrl', itemIndex) as string).trim();
	if (!/^https?:\/\//i.test(url)) {
		throw new NodeOperationError(context.getNode(), 'The recording link is not a web address', {
			description: 'Use a direct link that starts with https:// and points to the video file.',
			itemIndex,
		});
	}

	let response: { body: unknown; headers: IDataObject };
	try {
		response = (await context.helpers.httpRequest({
			method: 'GET',
			url,
			encoding: 'arraybuffer',
			returnFullResponse: true,
		})) as { body: unknown; headers: IDataObject };
	} catch (error) {
		throw new NodeOperationError(context.getNode(), 'The app screen recording could not be downloaded', {
			description: `n8n could not load ${url}. Open the link in a browser. It must start the video file directly, without a login. (${(error as Error).message})`,
			itemIndex,
		});
	}

	const mimeType = String(response.headers?.['content-type'] ?? '').split(';')[0];
	return {
		file: Buffer.from(response.body as ArrayBuffer),
		extension: recordingExtension(url, mimeType),
		mimeType: mimeType.startsWith('video/') ? mimeType : 'video/mp4',
	};
}

async function createFinishedVideo(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const clipId = context.getNodeParameter('clipId', itemIndex) as number;
	const hookText = context.getNodeParameter('hookText', itemIndex) as string;
	const recording = await loadRecording(context, itemIndex);

	// The API takes the recording as a file: ask for an upload address, send the
	// bytes straight to storage, then pass the returned key on.
	const upload = (await clipUgcApiRequest(context, 'POST', '/uploads/presign', itemIndex, {
		purpose: 'app_video',
		extension: recording.extension,
	})) as IDataObject;

	try {
		await context.helpers.httpRequest({
			method: (upload.method as 'PUT' | undefined) ?? 'PUT',
			url: upload.upload_url as string,
			body: recording.file,
			headers: { 'Content-Type': recording.mimeType, ...uploadHeaders(upload.headers) },
		});
	} catch (error) {
		throw new NodeOperationError(context.getNode(), 'The app screen recording could not be uploaded', {
			description: `Run this again. If it keeps happening, check that the file is a video under 100 MB. (${(error as Error).message})`,
			itemIndex,
		});
	}

	const clip = (await clipUgcApiRequest(
		context,
		'POST',
		`/character-videos/${clipId}/merge`,
		itemIndex,
		{ app_video_key: upload.key, hook_text: hookText },
	)) as IDataObject;

	const finishedVideoId = clip.merged_video_id;
	if (!finishedVideoId) {
		throw new NodeOperationError(context.getNode(), 'ClipUGC did not start the finished video', {
			description: 'Run this again. The clip must be completed before it can be used.',
			itemIndex,
		});
	}

	const path = `/merged-videos/${String(finishedVideoId)}`;
	const wait = readWaitSettings(context, itemIndex);
	const video = wait
		? await waitUntilCompleted(context, path, 'finished video', wait, itemIndex)
		: ((await clipUgcApiRequest(context, 'GET', path, itemIndex)) as IDataObject);

	return [await withDownloadUrl(context, video, itemIndex)];
}

async function getFinishedVideo(
	context: IExecuteFunctions,
	itemIndex: number,
): Promise<IDataObject[]> {
	const id = context.getNodeParameter('finishedVideoId', itemIndex) as number;
	const video = (await clipUgcApiRequest(
		context,
		'GET',
		`/merged-videos/${id}`,
		itemIndex,
	)) as IDataObject;
	return [await withDownloadUrl(context, video, itemIndex)];
}

const handlers: Record<
	string,
	(context: IExecuteFunctions, itemIndex: number) => Promise<IDataObject[]>
> = {
	'account:getCredits': getCredits,
	'aiInfluencer:create': createAiInfluencer,
	'aiInfluencer:getAll': getManyAiInfluencers,
	'look:generate': generateLook,
	'look:get': getLook,
	'clip:create': createClip,
	'clip:get': getClip,
	'finishedVideo:create': createFinishedVideo,
	'finishedVideo:get': getFinishedVideo,
};

export class ClipUgc implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ClipUGC',
		name: 'clipUgc',
		icon: { light: 'file:clipugc.png', dark: 'file:clipugc.png' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Make short vertical UGC videos for your app with AI influencers who keep the same face',
		defaults: {
			name: 'ClipUGC',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'clipUgcApi',
				required: true,
			},
		],
		properties: [resourceProperty, ...operationProperties, ...fieldProperties],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const handler = handlers[`${resource}:${operation}`];

				if (!handler) {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not available for "${resource}"`,
						{ itemIndex },
					);
				}

				for (const json of await handler(this, itemIndex)) {
					returnData.push({ json, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
							description: (error as NodeApiError).description ?? null,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, {
						message: error.message,
						description: error.description ?? undefined,
						httpCode: error.httpCode ?? undefined,
						itemIndex,
					});
				}
				// A NodeOperationError passed in here is kept as it is, with its description.
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
