import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

export const CREDENTIAL_NAME = 'clipUgcApi';
export const DEFAULT_BASE_URL = 'https://clipugc.com/api/v2';

/** File types ClipUGC takes as an app screen recording. */
export const RECORDING_EXTENSIONS = ['mp4', 'mov', 'qt', 'm4v', '3gp', '3g2', 'webm'];

export interface Refusal {
	message: string;
	description: string;
	httpCode: string;
}

function asText(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/** Ends a server sentence with exactly one period so more text can follow it. */
function asSentence(text: string): string {
	return `${text.trim().replace(/[.!?]+$/, '')}.`;
}

/**
 * Turns a ClipUGC answer into plain words, or returns null when the call worked.
 *
 * ClipUGC answers most refusals with HTTP 200 and puts the real code in
 * `statusCode` in the body. Only the plan check (402), a blocked account (403) and
 * the rate limit (429) also set the HTTP status. So both are read here.
 */
export function explainRefusal(httpStatus: number, body: IDataObject): Refusal | null {
	const code = typeof body.statusCode === 'number' ? body.statusCode : httpStatus;
	const serverText = asText(body.errorMessage) || asText(body.message);
	const data = (body.data ?? {}) as IDataObject;

	if (httpStatus >= 200 && httpStatus < 300 && (code === 200 || code === 201)) {
		return null;
	}

	if (httpStatus === 402 || (code === 1002 && data.required_plans !== undefined)) {
		const pricingUrl = asText(data.pricing_url) || 'https://clipugc.com/#pricing';
		return {
			message: 'Your ClipUGC plan does not include API access',
			description: `API keys work on the Professional and Business plans. Upgrade at ${pricingUrl} and run this again. Your key stays valid. (ClipUGC code 1002)`,
			httpCode: '402',
		};
	}

	if (code === 1002) {
		return {
			message: 'Your ClipUGC plan does not allow this',
			description: `${asSentence(serverText || 'This needs a higher plan')} (ClipUGC code 1002)`,
			httpCode: '1002',
		};
	}

	if (code === 1003) {
		return {
			message: 'Not enough ClipUGC credits',
			description: `${asSentence(serverText || 'This step costs more credits than the account has')} Nothing was charged. Add credits or wait for your monthly credits, then run this again. (ClipUGC code 1003)`,
			httpCode: '1003',
		};
	}

	if (code === 401) {
		return {
			message: 'ClipUGC did not accept the API key',
			description:
				'Open the ClipUGC credential and paste the key again. Create keys in ClipUGC under Dashboard > API Keys.',
			httpCode: '401',
		};
	}

	if (code === 429) {
		const retryAfter = data.retry_after;
		return {
			message: 'Too many requests for this ClipUGC key',
			description:
				typeof retryAfter === 'number'
					? `Wait ${retryAfter} seconds and run this again.`
					: 'Wait a minute and run this again.',
			httpCode: '429',
		};
	}

	if (httpStatus === 422 || code === 422) {
		const errors = (body.errors ?? {}) as Record<string, string[]>;
		const details = Object.values(errors)
			.flat()
			.filter((line) => typeof line === 'string')
			.join(' ');
		return {
			message: 'ClipUGC did not accept these values',
			description: details || serverText || 'Check the fields of this node.',
			httpCode: '422',
		};
	}

	return {
		message: `ClipUGC answered with code ${code}`,
		description: serverText || 'No more details were given.',
		httpCode: String(code),
	};
}

export async function getBaseUrl(context: IExecuteFunctions): Promise<string> {
	const credentials = await context.getCredentials(CREDENTIAL_NAME);
	return (asText(credentials.baseUrl) || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** Calls the ClipUGC API and returns the `data` part of the answer. */
export async function clipUgcApiRequest(
	context: IExecuteFunctions,
	method: IHttpRequestMethods,
	path: string,
	itemIndex: number,
	body?: IDataObject,
	qs?: IDataObject,
): Promise<unknown> {
	const options: IHttpRequestOptions = {
		method,
		url: `${await getBaseUrl(context)}${path}`,
		headers: { Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (body !== undefined) {
		options.body = body;
	}
	if (qs !== undefined) {
		options.qs = qs;
	}

	const response = (await context.helpers.httpRequestWithAuthentication.call(
		context,
		CREDENTIAL_NAME,
		options,
	)) as { statusCode: number; body: unknown };

	const answer: IDataObject =
		response.body !== null && typeof response.body === 'object'
			? (response.body as IDataObject)
			: { errorMessage: asText(response.body).slice(0, 300) };

	const refusal = explainRefusal(response.statusCode, answer);
	if (refusal) {
		throw new NodeApiError(context.getNode(), answer as JsonObject, { ...refusal, itemIndex });
	}

	return answer.data;
}

export interface WaitSettings {
	/** Seconds between two status checks. */
	pollInterval: number;
	/** Seconds after which the node stops waiting. */
	maxWait: number;
}

/**
 * Asks ClipUGC for the status again and again until it is `completed`.
 * Stops with a clear message when the status is `failed` or the wait is over.
 */
export async function waitUntilCompleted(
	context: IExecuteFunctions,
	path: string,
	what: string,
	settings: WaitSettings,
	itemIndex: number,
): Promise<IDataObject> {
	const pollInterval = Math.max(0, settings.pollInterval);
	const maxWait = Math.max(0, settings.maxWait);
	let waited = 0;

	for (;;) {
		const current = (await clipUgcApiRequest(context, 'GET', path, itemIndex)) as IDataObject;

		if (current.status === 'completed') {
			return current;
		}

		if (current.status === 'failed') {
			throw new NodeOperationError(context.getNode(), `ClipUGC could not make this ${what}`, {
				description:
					'Credits charged for it were returned. Change the prompt or run this again.',
				itemIndex,
			});
		}

		if (waited >= maxWait) {
			throw new NodeOperationError(
				context.getNode(),
				`The ${what} is still not ready after ${maxWait} seconds`,
				{
					description: `Nothing is lost. It keeps running on ClipUGC. Raise Max Wait, or read it later with the Get operation and ID ${String(current.id)}.`,
					itemIndex,
				},
			);
		}

		const pause = Math.max(1, Math.min(pollInterval, maxWait - waited));
		await sleep(pollInterval === 0 ? 0 : pause * 1000);
		waited += pause;
	}
}

/** Picks the file type for an upload from a file name, a link or a MIME type. */
export function recordingExtension(nameOrUrl: string, mimeType?: string): string {
	const withoutQuery = nameOrUrl.split('?')[0].split('#')[0];
	const fromName = withoutQuery.includes('.') ? withoutQuery.split('.').pop()!.toLowerCase() : '';
	if (RECORDING_EXTENSIONS.includes(fromName)) {
		return fromName;
	}

	const mime = (mimeType ?? '').toLowerCase();
	if (mime.includes('quicktime')) {
		return 'mov';
	}
	if (mime.includes('webm')) {
		return 'webm';
	}
	if (mime.includes('3gpp2')) {
		return '3g2';
	}
	if (mime.includes('3gpp')) {
		return '3gp';
	}
	return 'mp4';
}

/** Storage upload headers, without `Host` (the HTTP client sets it) and with single values. */
export function uploadHeaders(headers: unknown): Record<string, string> {
	const result: Record<string, string> = {};
	if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
		return result;
	}
	for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
		if (name.toLowerCase() === 'host') {
			continue;
		}
		result[name] = String(Array.isArray(value) ? value[0] : value);
	}
	return result;
}
