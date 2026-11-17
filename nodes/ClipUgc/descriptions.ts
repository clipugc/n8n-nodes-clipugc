import type { INodeProperties } from 'n8n-workflow';

const show = (resource: string, operation: string[]) => ({
	show: { resource: [resource], operation },
});

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Account', value: 'account' },
		{ name: 'AI Influencer', value: 'aiInfluencer' },
		{ name: 'Clip', value: 'clip' },
		{ name: 'Finished Video', value: 'finishedVideo' },
		{ name: 'Look', value: 'look' },
	],
	default: 'clip',
};

export const operationProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get Credits',
				value: 'getCredits',
				description: 'Get the credit balance and what each generation costs right now',
				action: 'Get credits and prices',
			},
		],
		default: 'getCredits',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['aiInfluencer'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Design a new AI influencer from a description and start the first look',
				action: 'Create an AI influencer',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List your own AI influencers, the public cast, or both',
				action: 'Get many AI influencers',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['look'] } },
		options: [
			{
				name: 'Generate',
				value: 'generate',
				description: 'Make a new picture of an AI influencer with the same face',
				action: 'Generate a look',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a look and its current status',
				action: 'Get a look',
			},
		],
		default: 'generate',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['clip'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Turn a look into a short silent vertical clip',
				action: 'Create a clip',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a clip and its current status',
				action: 'Get a clip',
			},
		],
		default: 'create',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['finishedVideo'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Put a clip, your app screen recording and a hook line together',
				action: 'Create a finished video',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a finished video, its status and a download link',
				action: 'Get a finished video',
			},
		],
		default: 'create',
	},
];

const aiInfluencerFields: INodeProperties[] = [
	{
		displayName: 'Description',
		name: 'description',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		placeholder:
			'e.g. A friendly person in their late twenties with short dark hair, wearing a plain hoodie',
		description: 'Describe the person in plain words. 10 to 1000 characters.',
		displayOptions: show('aiInfluencer', ['create']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('aiInfluencer', ['create']),
		options: [
			{
				displayName: 'Public',
				name: 'isPublic',
				type: 'boolean',
				default: false,
				description: 'Whether other ClipUGC accounts can use this AI influencer',
			},
			{
				displayName: 'Scene',
				name: 'scenePrompt',
				type: 'string',
				default: '',
				placeholder: 'e.g. Sitting on a sofa at home, soft daylight',
				description: 'Where the first look is set. Up to 600 characters.',
			},
		],
	},
	{
		displayName: 'Show',
		name: 'scope',
		type: 'options',
		options: [
			{
				name: 'My AI Influencers',
				value: 'mine',
				description: 'Only the ones this account created',
			},
			{
				name: 'Public Cast',
				value: 'discover',
				description: 'AI influencers every account can use',
			},
			{
				name: 'Both',
				value: 'feed',
				description: 'Yours first, then the public cast',
			},
		],
		default: 'discover',
		displayOptions: show('aiInfluencer', ['getAll']),
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: show('aiInfluencer', ['getAll']),
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['aiInfluencer'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show('aiInfluencer', ['getAll']),
		options: [
			{
				displayName: 'Name Contains',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Only AI influencers whose name contains this text',
			},
		],
	},
];

const lookFields: INodeProperties[] = [
	{
		displayName: 'AI Influencer ID',
		name: 'aiInfluencerId',
		type: 'number',
		required: true,
		default: 0,
		description: 'The ID of one of your AI influencers or of a public one',
		displayOptions: show('look', ['generate']),
	},
	{
		displayName: 'Scene',
		name: 'scenePrompt',
		type: 'string',
		default: '',
		placeholder: 'e.g. In a gym, wearing sportswear, holding a phone',
		description: 'The setting and outfit of the new picture. Up to 600 characters.',
		displayOptions: show('look', ['generate']),
	},
	{
		displayName: 'Look ID',
		name: 'lookId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: show('look', ['get']),
	},
];

const clipFields: INodeProperties[] = [
	{
		displayName: 'Look ID',
		name: 'lookId',
		type: 'number',
		required: true,
		default: 0,
		description:
			'The picture to animate. Use "look_id" from AI Influencer > Get Many, AI Influencer > Create or Look > Generate.',
		displayOptions: show('clip', ['create']),
	},
	{
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		placeholder:
			'e.g. Looks down at the phone, eyes go wide in surprise, then smiles at the camera',
		description:
			'What the AI influencer does. Movement and expression only, the clip is silent. Up to 1500 characters.',
		displayOptions: show('clip', ['create']),
	},
	{
		displayName: 'Duration',
		name: 'duration',
		type: 'options',
		options: [
			{ name: '5 Seconds', value: 5 },
			{ name: '10 Seconds', value: 10 },
		],
		default: 5,
		description: 'A 10 second clip costs more credits. Account > Get Credits shows both prices.',
		displayOptions: show('clip', ['create']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('clip', ['create']),
		options: [
			{
				displayName: 'Scene',
				name: 'scenePrompt',
				type: 'string',
				default: '',
				placeholder: 'e.g. At a desk in a bright office',
				description:
					'Restyle the setting before the clip is made. This adds the price of one look. Up to 600 characters.',
			},
		],
	},
	{
		displayName: 'Clip ID',
		name: 'clipId',
		type: 'number',
		required: true,
		default: 0,
		displayOptions: show('clip', ['get']),
	},
];

const finishedVideoFields: INodeProperties[] = [
	{
		displayName: 'Clip ID',
		name: 'clipId',
		type: 'number',
		required: true,
		default: 0,
		description: 'A completed clip. Use "ID" from Clip > Create.',
		displayOptions: show('finishedVideo', ['create']),
	},
	{
		displayName: 'App Screen Recording',
		name: 'recordingSource',
		type: 'options',
		options: [
			{
				name: 'From a Link',
				value: 'url',
				description: 'A direct link to the video file',
			},
			{
				name: 'From a Previous Node',
				value: 'binary',
				description: 'A file that an earlier node in this workflow loaded',
			},
		],
		default: 'url',
		displayOptions: show('finishedVideo', ['create']),
	},
	{
		displayName: 'Recording Link',
		name: 'recordingUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/my-app-screen-recording.mp4',
		description: 'A direct link to an MP4 or MOV of your app screen. It plays after the clip.',
		displayOptions: {
			show: { resource: ['finishedVideo'], operation: ['create'], recordingSource: ['url'] },
		},
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input field that holds the video file',
		displayOptions: {
			show: { resource: ['finishedVideo'], operation: ['create'], recordingSource: ['binary'] },
		},
	},
	{
		displayName: 'Hook Line',
		name: 'hookText',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. POV: you found the app that plans your whole week',
		description: 'The text shown on top of the video. Up to 150 characters.',
		displayOptions: show('finishedVideo', ['create']),
	},
	{
		displayName: 'Finished Video ID',
		name: 'finishedVideoId',
		type: 'number',
		required: true,
		default: 0,
		description: 'Use "ID" from Finished Video > Create',
		displayOptions: show('finishedVideo', ['get']),
	},
];

const waitingResources = {
	show: {
		resource: ['aiInfluencer', 'look', 'clip', 'finishedVideo'],
		operation: ['create', 'generate'],
	},
};

const waitFields: INodeProperties[] = [
	{
		displayName: 'Wait for Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: true,
		description:
			'Whether to wait until ClipUGC has finished. Turn this off to get the ID at once and check later with the Get operation.',
		displayOptions: waitingResources,
	},
	{
		displayName: 'Check Every (Seconds)',
		name: 'pollInterval',
		type: 'number',
		typeOptions: { minValue: 5 },
		default: 10,
		description: 'How long to pause between two status checks',
		displayOptions: { show: { ...waitingResources.show, waitForCompletion: [true] } },
	},
	{
		displayName: 'Max Wait (Seconds)',
		name: 'maxWait',
		type: 'number',
		typeOptions: { minValue: 10 },
		default: 600,
		description:
			'The node stops waiting after this time. The generation keeps running on ClipUGC and you can read it later with the Get operation.',
		displayOptions: { show: { ...waitingResources.show, waitForCompletion: [true] } },
	},
];

export const fieldProperties: INodeProperties[] = [
	...aiInfluencerFields,
	...lookFields,
	...clipFields,
	...finishedVideoFields,
	...waitFields,
];
