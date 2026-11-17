import type { IDataObject } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { ClipUgcApi } from '../credentials/ClipUgcApi.credentials';
import { ClipUgc } from '../nodes/ClipUgc/ClipUgc.node';
import { fakeContext, ok, refused } from './helpers';

const node = new ClipUgc();
const run = async (context: ReturnType<typeof fakeContext>['context']) =>
	(await node.execute.call(context))[0].map((item) => item.json as IDataObject);

describe('node description', () => {
	it('uses the ClipUGC credential and can be used as a tool', () => {
		expect(node.description.name).toBe('clipUgc');
		expect(node.description.credentials).toEqual([{ name: 'clipUgcApi', required: true }]);
		expect(node.description.usableAsTool).toBe(true);
	});

	it('keeps user-facing text within the copy rules', () => {
		const text = JSON.stringify([node.description, new ClipUgcApi().properties]);
		expect(text).not.toMatch(/[–—]/);
		expect(text).not.toMatch(/\b(ad|ads|her|him)\b/i);
	});
});

describe('Account > Get Credits', () => {
	it('returns the balance and prices', async () => {
		const { context, apiCalls } = fakeContext(
			{ resource: 'account', operation: 'getCredits' },
			{ 'GET /credits': ok({ balance: 93, costs: { image: 2, clip: 7, merge: 0 } }) },
		);
		expect(await run(context)).toEqual([{ balance: 93, costs: { image: 2, clip: 7, merge: 0 } }]);
		expect(apiCalls[0].url).toBe('https://clipugc.test/api/v2/credits');
	});

	it('surfaces the plan gate as a clear message', async () => {
		const { context } = fakeContext(
			{ resource: 'account', operation: 'getCredits' },
			{
				'GET /credits': refused(1002, 'API keys need the Professional or Business plan.', {
					required_plans: ['professional', 'business'],
					pricing_url: 'https://clipugc.com/#pricing',
				}, 402),
			},
		);
		await expect(run(context)).rejects.toMatchObject({
			message: 'Your ClipUGC plan does not include API access',
			httpCode: '402',
		});
	});
});

describe('AI Influencer', () => {
	it('lists the public cast with a look_id per row and follows pages', async () => {
		const { context, apiCalls } = fakeContext(
			{ resource: 'aiInfluencer', operation: 'getAll', scope: 'discover', returnAll: true },
			{
				'GET /ai-characters': [
					ok({ ai_characters: [{ id: 1, cover_image: { id: 11 } }], pagination: { has_more_pages: true } }),
					ok({ ai_characters: [{ id: 2, cover_image: null }], pagination: { has_more_pages: false } }),
				],
			},
		);
		const rows = await run(context);
		expect(rows.map((row) => row.look_id)).toEqual([11, null]);
		expect(apiCalls.map((call) => call.qs?.page)).toEqual([1, 2]);
		expect(apiCalls[0].qs?.scope).toBe('discover');
	});

	it('creates one and waits for the first look', async () => {
		const { context, apiCalls } = fakeContext(
			{
				resource: 'aiInfluencer',
				operation: 'create',
				description: 'A friendly person with short dark hair',
				additionalFields: { scenePrompt: 'On a sofa' },
				waitForCompletion: true,
				pollInterval: 0,
				maxWait: 5,
			},
			{
				'POST /ai-characters': ok({ id: 5, reference_images: [{ id: 50, status: 'pending' }] }, 201),
				'GET /character-images/50/check-status': [
					ok({ id: 50, status: 'processing' }),
					ok({ id: 50, status: 'completed' }),
				],
			},
		);
		const [created] = await run(context);
		expect(created.look_id).toBe(50);
		expect(created.look_status).toBe('completed');
		expect(apiCalls[0].body).toEqual({
			description: 'A friendly person with short dark hair',
			scene_prompt: 'On a sofa',
		});
	});
});

describe('Clip > Create', () => {
	const parameters = { resource: 'clip', operation: 'create', lookId: 11, prompt: 'Smiles', duration: 5 };

	it('returns at once when waiting is off', async () => {
		const { context, apiCalls } = fakeContext(
			{ ...parameters, waitForCompletion: false },
			{ 'POST /character-videos/image-to-video': ok({ id: 7, status: 'pending' }, 201) },
		);
		expect(await run(context)).toEqual([{ id: 7, status: 'pending' }]);
		expect(apiCalls[0].body).toEqual({ character_reference_image_id: 11, duration: 5, prompt: 'Smiles' });
	});

	it('surfaces out of credits as a clear message', async () => {
		const { context } = fakeContext(parameters, {
			'POST /character-videos/image-to-video': refused(1003, 'Not enough credits to generate a clip'),
		});
		await expect(run(context)).rejects.toMatchObject({
			message: 'Not enough ClipUGC credits',
			httpCode: '1003',
		});
	});

	it('puts the message on the item when Continue On Fail is on', async () => {
		const { context } = fakeContext(
			parameters,
			{ 'POST /character-videos/image-to-video': refused(1003, 'Not enough credits to generate a clip') },
			{ continueOnFail: true },
		);
		const [item] = await run(context);
		expect(item.error).toBe('Not enough ClipUGC credits');
		expect(item.description).toContain('1003');
	});
});

const UPLOAD_PATH = ['tmp', 'api-uploads', '3', 'app_video', 'x.mp4'].join('/');

describe('Finished Video', () => {
	const answers = () => ({
		'POST /uploads/presign': ok({
			key: UPLOAD_PATH,
			upload_url: 'https://storage.test/put?sig=1',
			method: 'PUT',
			headers: { Host: ['storage.test'] },
		}),
		'POST /character-videos/7/merge': ok({ id: 7, merged_video_id: 3 }, 201),
		'GET /merged-videos/3': [ok({ id: 3, status: 'processing' }), ok({ id: 3, status: 'completed' })],
		'GET /merged-videos/3/download': ok({ download_url: 'https://clipugc.test/file.mp4' }),
	});

	it('downloads the link, uploads the file, waits and returns the download link', async () => {
		const { context, apiCalls, plainCalls } = fakeContext(
			{
				resource: 'finishedVideo',
				operation: 'create',
				clipId: 7,
				recordingSource: 'url',
				recordingUrl: 'https://example.com/screen.mov',
				hookText: 'POV: you found the app',
				pollInterval: 0,
				maxWait: 5,
			},
			answers(),
		);
		const [video] = await run(context);
		expect(video).toMatchObject({ id: 3, status: 'completed', download_url: 'https://clipugc.test/file.mp4' });

		expect(plainCalls[0]).toMatchObject({ method: 'GET', url: 'https://example.com/screen.mov' });
		expect(plainCalls[1]).toMatchObject({ method: 'PUT', url: 'https://storage.test/put?sig=1' });
		expect(plainCalls[1].headers).toEqual({ 'Content-Type': 'video/mp4' });
		expect(apiCalls[0].body).toEqual({ purpose: 'app_video', extension: 'mov' });
		expect(apiCalls[1].body).toEqual({
			app_video_key: UPLOAD_PATH,
			hook_text: 'POV: you found the app',
		});
	});

	it('takes the recording from a previous node', async () => {
		const { context, plainCalls } = fakeContext(
			{
				resource: 'finishedVideo',
				operation: 'create',
				clipId: 7,
				recordingSource: 'binary',
				binaryPropertyName: 'data',
				hookText: 'Hook',
				waitForCompletion: false,
			},
			answers(),
			{ binary: { fileName: 'rec.webm', mimeType: 'video/webm' } },
		);
		const [video] = await run(context);
		expect(video.download_url).toBeNull();
		expect(plainCalls).toHaveLength(1);
		expect(plainCalls[0].headers).toEqual({ 'Content-Type': 'video/webm' });
	});

	it('refuses a recording link that is not a web address', async () => {
		const { context } = fakeContext(
			{ resource: 'finishedVideo', operation: 'create', clipId: 7, recordingUrl: 'screen.mp4', hookText: 'Hook' },
			answers(),
		);
		await expect(run(context)).rejects.toMatchObject({
			message: 'The recording link is not a web address',
		});
	});

	it('gets one with its download link', async () => {
		const { context } = fakeContext(
			{ resource: 'finishedVideo', operation: 'get', finishedVideoId: 3 },
			{
				'GET /merged-videos/3': ok({ id: 3, status: 'completed' }),
				'GET /merged-videos/3/download': ok({ download_url: 'https://clipugc.test/file.mp4' }),
			},
		);
		expect(await run(context)).toEqual([
			{ id: 3, status: 'completed', download_url: 'https://clipugc.test/file.mp4' },
		]);
	});
});
