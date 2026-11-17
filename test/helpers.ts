import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { vi } from 'vitest';

export interface ApiCall {
	method: string;
	url: string;
	body?: unknown;
	qs?: IDataObject;
}

export interface FakeAnswer {
	statusCode?: number;
	body: unknown;
}

/** Wraps data in the ClipUGC envelope: HTTP 200 with the real code in `statusCode`. */
export const ok = (data: unknown, statusCode = 200): FakeAnswer => ({
	statusCode: 200,
	body: { statusCode, errorMessage: null, data, message: 'ok' },
});

export const refused = (code: number, errorMessage: string, data: unknown = null, http = 200): FakeAnswer => ({
	statusCode: http,
	body: { statusCode: code, errorMessage, data, message: null },
});

/**
 * A stand-in for the n8n execution context. `answers` maps "METHOD /path" to one
 * answer, or to a list that is used up call by call (the last one repeats).
 */
export function fakeContext(
	parameters: Record<string, unknown>,
	answers: Record<string, FakeAnswer | FakeAnswer[]>,
	options: { continueOnFail?: boolean; binary?: { fileName?: string; mimeType: string } } = {},
) {
	const apiCalls: ApiCall[] = [];
	const plainCalls: Array<{ method: string; url: string; headers?: IDataObject; body?: unknown }> = [];
	const baseUrl = 'https://clipugc.test/api/v2';

	const httpRequestWithAuthentication = vi.fn(async function (
		_credential: string,
		request: { method: string; url: string; body?: unknown; qs?: IDataObject },
	) {
		apiCalls.push({ method: request.method, url: request.url, body: request.body, qs: request.qs });
		const key = `${request.method} ${request.url.replace(baseUrl, '')}`;
		const answer = answers[key];
		if (answer === undefined) {
			throw new Error(`No fake answer for ${key}`);
		}
		if (Array.isArray(answer)) {
			return answer.length > 1 ? answer.shift() : answer[0];
		}
		return answer;
	});

	const httpRequest = vi.fn(async (request: { method: string; url: string; headers?: IDataObject; body?: unknown }) => {
		plainCalls.push(request);
		if (request.method === 'GET') {
			return { body: new Uint8Array([1, 2, 3]).buffer, headers: { 'content-type': 'video/mp4' } };
		}
		return {};
	});

	const context = {
		getInputData: () => [{ json: {} }],
		getNodeParameter: (name: string, _index: number, fallback?: unknown) =>
			name in parameters ? parameters[name] : fallback,
		getNode: () => ({ name: 'ClipUGC', type: 'n8n-nodes-clipugc.clipUgc', typeVersion: 1, id: '1', position: [0, 0], parameters: {} }),
		getCredentials: async () => ({ apiKey: 'test-key', baseUrl }),
		continueOnFail: () => options.continueOnFail ?? false,
		helpers: {
			httpRequestWithAuthentication,
			httpRequest,
			assertBinaryData: () => options.binary ?? { mimeType: 'video/mp4', fileName: 'screen.mp4' },
			getBinaryDataBuffer: async () => Buffer.from([9, 9, 9]),
		},
	} as unknown as IExecuteFunctions;

	return { context, apiCalls, plainCalls };
}
