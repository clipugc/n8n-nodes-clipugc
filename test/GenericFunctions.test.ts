import { describe, expect, it } from 'vitest';

import {
	explainRefusal,
	recordingExtension,
	uploadHeaders,
	waitUntilCompleted,
} from '../nodes/ClipUgc/GenericFunctions';
import { fakeContext, ok } from './helpers';

describe('explainRefusal', () => {
	it('lets a normal answer through', () => {
		expect(explainRefusal(200, { statusCode: 200, data: {} })).toBeNull();
		expect(explainRefusal(200, { statusCode: 201, data: {} })).toBeNull();
	});

	it('explains the API plan gate (HTTP 402, code 1002)', () => {
		const refusal = explainRefusal(402, {
			statusCode: 1002,
			errorMessage: 'API keys need the Professional or Business plan.',
			data: { required_plans: ['professional', 'business'], pricing_url: 'https://clipugc.com/#pricing' },
		});
		expect(refusal?.message).toBe('Your ClipUGC plan does not include API access');
		expect(refusal?.description).toContain('Professional and Business');
		expect(refusal?.description).toContain('https://clipugc.com/#pricing');
		expect(refusal?.description).toContain('1002');
		expect(refusal?.httpCode).toBe('402');
	});

	it('explains a plan limit that comes back as HTTP 200 with code 1002', () => {
		const refusal = explainRefusal(200, {
			statusCode: 1002,
			errorMessage: 'Videos of your own AI influencer need a paid plan.',
			data: null,
		});
		expect(refusal?.message).toBe('Your ClipUGC plan does not allow this');
		expect(refusal?.description).toContain('Videos of your own AI influencer need a paid plan.');
	});

	it('explains out of credits (code 1003 inside HTTP 200)', () => {
		const refusal = explainRefusal(200, {
			statusCode: 1003,
			errorMessage: 'Not enough credits to generate a clip',
			data: null,
		});
		expect(refusal?.message).toBe('Not enough ClipUGC credits');
		expect(refusal?.description).toContain('Not enough credits to generate a clip');
		expect(refusal?.description).toContain('Nothing was charged');
		expect(refusal?.httpCode).toBe('1003');
	});

	it('explains a wrong key (code 401 inside HTTP 200)', () => {
		const refusal = explainRefusal(200, { statusCode: 401, errorMessage: 'Invalid Firebase ID token' });
		expect(refusal?.message).toBe('ClipUGC did not accept the API key');
		expect(refusal?.description).not.toContain('Firebase');
	});

	it('explains the rate limit with the wait time', () => {
		const refusal = explainRefusal(429, { statusCode: 429, data: { retry_after: 12 } });
		expect(refusal?.description).toBe('Wait 12 seconds and run this again.');
	});

	it('lists the fields of a validation answer', () => {
		const refusal = explainRefusal(422, {
			message: 'The hook text field is required.',
			errors: { hook_text: ['The hook text field is required.'] },
		});
		expect(refusal?.message).toBe('ClipUGC did not accept these values');
		expect(refusal?.description).toBe('The hook text field is required.');
	});

	it('passes on anything else with its code', () => {
		const refusal = explainRefusal(200, { statusCode: 404, errorMessage: 'Reference image not found' });
		expect(refusal?.message).toBe('ClipUGC answered with code 404');
		expect(refusal?.description).toBe('Reference image not found');
	});
});

describe('recordingExtension', () => {
	it('reads the type from a link, ignoring the query', () => {
		expect(recordingExtension('https://cdn.example.com/a/demo.MOV?sig=1')).toBe('mov');
		expect(recordingExtension('https://cdn.example.com/a/demo.webm')).toBe('webm');
	});

	it('falls back to the MIME type, then to mp4', () => {
		expect(recordingExtension('https://example.com/download?id=5', 'video/quicktime')).toBe('mov');
		expect(recordingExtension('https://example.com/file.bin')).toBe('mp4');
		expect(recordingExtension('')).toBe('mp4');
	});
});

describe('uploadHeaders', () => {
	it('drops Host and flattens list values', () => {
		expect(uploadHeaders({ Host: ['bucket.s3.amazonaws.com'], 'x-amz-acl': ['private'] })).toEqual({
			'x-amz-acl': 'private',
		});
	});

	it('treats the empty list the local API returns as no headers', () => {
		expect(uploadHeaders([])).toEqual({});
		expect(uploadHeaders(undefined)).toEqual({});
	});
});

describe('waitUntilCompleted', () => {
	const fast = { pollInterval: 0, maxWait: 5 };

	it('returns once the status is completed', async () => {
		const { context, apiCalls } = fakeContext({}, {
			'GET /character-videos/7/check-status': [
				ok({ id: 7, status: 'pending' }),
				ok({ id: 7, status: 'processing' }),
				ok({ id: 7, status: 'completed' }),
			],
		});
		const clip = await waitUntilCompleted(context, '/character-videos/7/check-status', 'clip', fast, 0);
		expect(clip.status).toBe('completed');
		expect(apiCalls).toHaveLength(3);
	});

	it('stops with plain words when the generation did not work', async () => {
		const { context } = fakeContext({}, {
			'GET /character-videos/7/check-status': ok({ id: 7, status: 'failed' }),
		});
		await expect(
			waitUntilCompleted(context, '/character-videos/7/check-status', 'clip', fast, 0),
		).rejects.toMatchObject({
			message: 'ClipUGC could not make this clip',
			description: expect.stringContaining('returned'),
		});
	});

	it('stops after the max wait and says how to read the result later', async () => {
		const { context, apiCalls } = fakeContext({}, {
			'GET /merged-videos/3': ok({ id: 3, status: 'processing' }),
		});
		await expect(
			waitUntilCompleted(context, '/merged-videos/3', 'finished video', { pollInterval: 0, maxWait: 3 }, 0),
		).rejects.toMatchObject({
			message: 'The finished video is still not ready after 3 seconds',
			description: expect.stringContaining('ID 3'),
		});
		expect(apiCalls.length).toBeLessThanOrEqual(4);
	});
});
