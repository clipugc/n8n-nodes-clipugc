import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class ClipUgcApi implements ICredentialType {
	name = 'clipUgcApi';

	displayName = 'ClipUGC API';

	icon: Icon = { light: 'file:clipugc.png', dark: 'file:clipugc.png' };

	documentationUrl = 'https://clipugc.com/docs/api';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Create a key in ClipUGC under Dashboard > API Keys. API keys work on the Professional and Business plans.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://clipugc.com/api/v2',
			description: 'Leave this as it is unless ClipUGC support gives you another address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				Accept: 'application/json',
			},
		},
	};

	// ClipUGC answers a wrong key with HTTP 200 and `statusCode: 401` in the body,
	// so the body is checked as well as the HTTP status. n8n runs both rule kinds
	// from one list, but its type only allows a list of a single kind, hence the cast.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/credits',
			method: 'GET',
		},
		rules: [
			{
				type: 'responseCode',
				properties: {
					value: 402,
					message:
						'The key is valid, but API keys only work on the ClipUGC Professional and Business plans. Upgrade the plan, then test again.',
				},
			},
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'statusCode',
					value: 401,
					message: 'ClipUGC did not accept this API key. Copy it again from Dashboard > API Keys.',
				},
			},
		] as unknown as ICredentialTestRequest['rules'],
	};
}
