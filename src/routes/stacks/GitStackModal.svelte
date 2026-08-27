<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import { Loader2, GitBranch, RefreshCw, Webhook, Rocket, RefreshCcw, Copy, Check, XCircle, FolderGit2, Github, Key, KeyRound, Lock, FileText, HelpCircle, GripVertical, X, Download, Hammer, ArrowDownToLine, Zap, FolderOpen, Ban, TriangleAlert, Settings2, Archive } from 'lucide-svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { page } from '$app/stores'; // BETA GATE: backups feature flag
	import BackupPanel from '../containers/BackupPanel.svelte';
	import { volumesForStack, type VolumeInfo } from '$lib/utils/mounts';
	import { fetchBackupExecutions } from '$lib/utils/backup';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import CronEditor from '$lib/components/cron-editor.svelte';
	import StackEnvVarsPanel from '$lib/components/StackEnvVarsPanel.svelte';
	import SecretProviderPicker from '$lib/components/SecretProviderPicker.svelte';
	import BranchCombobox from './BranchCombobox.svelte';
	import { type EnvVar, type ValidationResult } from '$lib/components/StackEnvVarsEditor.svelte';
	import { toast } from 'svelte-sonner';
	import { focusFirstInput } from '$lib/utils';
	import { readJobResponse } from '$lib/utils/sse-fetch';


	// localStorage key for persisted split ratio
	const STORAGE_KEY_SPLIT = 'dockhand-git-stack-modal-split';

	interface GitCredential {
		id: number;
		name: string;
		authType: string;
	}

	function getAuthLabel(authType: string) {
		switch (authType) {
			case 'ssh': return m.stacks_git_modal_auth_ssh();
			case 'password': return m.login_password();
			default: return m.network_mode_none();
		}
	}

	interface GitRepository {
		id: number;
		name: string;
		url: string;
		branch: string;
		credentialId: number | null;
	}

	interface GitStack {
		id: number;
		stackName: string;
		repositoryId: number;
		branch?: string | null; // Per-stack branch override; null = use repository default
		environmentId: number | null;
		composePath: string;
		envFilePath: string | null;
		autoUpdate: boolean;
		autoUpdateSchedule: 'daily' | 'weekly' | 'custom';
		autoUpdateCron: string;
		webhookEnabled: boolean;
		webhookSecret: string | null;
		contextDir: string | null;
		buildOnDeploy: boolean;
		noBuildCache: boolean;
		repullImages: boolean;
		forceRedeploy: boolean;
	}

	interface Props {
		open: boolean;
		gitStack?: GitStack | null;
		environmentId?: number | null;
		repositories: GitRepository[];
		credentials: GitCredential[];
		onClose: () => void;
		onSaved: () => void;
	}

	let { open = $bindable(), gitStack = null, environmentId = null, repositories, credentials, onClose, onSaved }: Props = $props();

	// Form state - repository selection or creation
	let formRepoMode = $state<'existing' | 'new'>('existing');
	let formRepositoryId = $state<number | null>(null);
	let formNewRepoName = $state('');
	let formNewRepoUrl = $state('');
	let formNewRepoBranch = $state('main');
	let formNewRepoCredentialId = $state<number | null>(null);

	// Tabs: Settings (the deploy form) and Backups (edit mode + feature flag only).
	let activeTab = $state<'settings' | 'backups'>('settings');
	// The stack's volumes, loaded lazily when the Backups tab opens (git stacks
	// don't otherwise need them). Feeds the backup volume picker.
	let stackVolumes = $state<VolumeInfo[]>([]);
	let stackVolumesLoaded = $state(false);
	// Ok/fail run tally shown on the Backups tab (edit mode only).
	let backupTally = $state<{ ok: number; failed: number }>({ ok: 0, failed: 0 });
	let backupTallyLoaded = $state(false);
	const effectiveEnvId = $derived(gitStack?.environmentId ?? environmentId ?? null);

	async function loadBackupTally() {
		if (backupTallyLoaded || !gitStack) return;
		backupTallyLoaded = true;
		try {
			const p = new URLSearchParams({ target: formStackName, type: 'stack' });
			if (effectiveEnvId != null) p.set('env', String(effectiveEnvId));
			const res = await fetch(`/api/backup/configs?${p}`);
			if (!res.ok) return;
			const data = await res.json();
			const cfgs = Array.isArray(data) ? data : data?.id ? [data] : [];
			if (cfgs.length > 0) {
				const t = await fetchBackupExecutions(cfgs.map((c: any) => c.id));
				backupTally = { ok: t.ok, failed: t.failed };
			}
		} catch { /* tally is best-effort */ }
	}

	async function loadStackVolumes() {
		if (stackVolumesLoaded) return;
		stackVolumesLoaded = true;
		try {
			const url = effectiveEnvId != null ? `/api/containers?env=${effectiveEnvId}` : '/api/containers';
			const res = await fetch(url);
			if (res.ok) stackVolumes = volumesForStack(await res.json(), formStackName);
		} catch { /* picker just shows "no volumes" — backup still defaults to all */ }
	}

	// Load volumes the first time the Backups tab is opened.
	$effect(() => {
		if (activeTab === 'backups') void loadStackVolumes();
	});

	// Form state - stack deployment config
	let formStackName = $state('');
	let formStackNameUserModified = $state(false);
	let formComposePath = $state('compose.yaml');
	let formAutoUpdate = $state(false);
	let formAutoUpdateCron = $state('0 3 * * *');
	let formWebhookEnabled = $state(false);
	let formWebhookSecret = $state('');
	let formContextDir = $state<string | null>(null);
	let formBuildOnDeploy = $state(false);
	let formNoBuildCache = $state(false);
	let formRepullImages = $state(false);
	let formForceRedeploy = $state(false);
	let formDeployNow = $state(false);
	let formError = $state('');
	let formSaving = $state(false);
	let showExistsWarning = $state(false);
	let errors = $state<{ stackName?: string; repository?: string; repoName?: string; repoUrl?: string; webhookSecret?: string }>({});

	// Branch selection
	let formBranch = $state<string | null>(null);
	let branches = $state<{ name: string; sha: string }[]>([]);
	let branchesLoading = $state(false);
	// Monotonic token that guards against a stale branch-enumeration response
	// overwriting `branches` for a newer repository URL (the $effect below can
	// fire multiple times as the repo selection changes; a slow response for
	// repo A must not clobber the branch list belonging to repo B).
	let branchesFetchSeq = 0;

	// Sentinel select value meaning "no per-stack override — use the repository's
	// default branch". Contains ':' which is invalid in git refs, so it can never
	// collide with a real branch name.

	// Stack name validation: Docker Compose requires lowercase; must start with a
	// letter or number, and contain only lowercase letters, numbers, hyphens, underscores
	const STACK_NAME_REGEX = /^[a-z0-9][a-z0-9_-]*$/;
	let copiedWebhookUrl = $state<'ok' | 'error' | null>(null);
	let copiedWebhookSecret = $state<'ok' | 'error' | null>(null);

	// Secret providers
	type SecretProviderOption = { id: number; name: string; type: string };
	let secretProviders = $state<SecretProviderOption[]>([]);
	let formSecretProviderId = $state<number | null>(null);
	let injectedSecretKeys = $state<string[]>([]);

	// Environment variables state
	let formEnvFilePath = $state<string | null>(null);
	let envFiles = $state<string[]>([]);
	let loadingEnvFiles = $state(false);
	let envVars = $state<EnvVar[]>([]);
	let fileEnvVars = $state<Record<string, string>>({});
	let loadingFileVars = $state(false);
	let existingSecretKeys = $state<Set<string>>(new Set());
	let populatingEnvVars = $state(false);

	// Resizable split panel state
	let splitRatio = $state(60); // percentage for form panel
	let isDraggingSplit = $state(false);
	let containerRef: HTMLDivElement | null = $state(null);


	// Track which gitStack was initialized to avoid repeated resets
	let lastInitializedStackId = $state<number | null | undefined>(undefined);
	let isInitializing = $state(false);

	$effect(() => {
		if (open) {
			const currentStackId = gitStack?.id ?? null;
			if (lastInitializedStackId !== currentStackId && !isInitializing) {
				lastInitializedStackId = currentStackId;
				isInitializing = true;
				resetForm().finally(() => {
					isInitializing = false;
				});
			}
		} else {
			lastInitializedStackId = undefined;
		}
	});

	// Derived state for selected repository
	let selectedRepo = $derived(formRepositoryId ? repositories.find(r => r.id === formRepositoryId) : null);

	onMount(() => {
		// Load saved split ratio
		const savedSplit = localStorage.getItem(STORAGE_KEY_SPLIT);
		if (savedSplit) {
			const ratio = parseFloat(savedSplit);
			if (!isNaN(ratio) && ratio >= 30 && ratio <= 80) {
				splitRatio = ratio;
			}
		}

		// Add global mouse event listeners for split dragging
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);

		fetchSecretProviders();
	});

	async function fetchSecretProviders() {
		try {
			const response = await fetch('/api/secret-providers');
			if (!response.ok) return;
			const data = await response.json();
			secretProviders = (data ?? []).map((p: any) => ({ id: p.id, name: p.name, type: p.type }));
		} catch (e) {
			console.warn('Failed to load secret providers:', e);
		}
	}

	onDestroy(() => {
		window.removeEventListener('mousemove', handleMouseMove);
		window.removeEventListener('mouseup', handleMouseUp);
	});

	// Split panel drag handlers
	function startSplitDrag(e: MouseEvent) {
		e.preventDefault();
		isDraggingSplit = true;
	}

	function handleMouseMove(e: MouseEvent) {
		if (isDraggingSplit && containerRef) {
			const rect = containerRef.getBoundingClientRect();
			const newRatio = ((e.clientX - rect.left) / rect.width) * 100;
			splitRatio = Math.max(30, Math.min(80, newRatio));
		}
	}

	function handleMouseUp() {
		if (isDraggingSplit) {
			isDraggingSplit = false;
			// Save split ratio
			localStorage.setItem(STORAGE_KEY_SPLIT, splitRatio.toString());
		}
	}

	function generateWebhookSecret(): string {
		const array = new Uint8Array(24);
		crypto.getRandomValues(array);
		return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
	}

	function getWebhookUrl(stackId: number): string {
		return `${window.location.origin}/api/git/stacks/${stackId}/webhook`;
	}

	async function copyWebhookField(text: string, type: 'url' | 'secret') {
		const ok = await copyToClipboard(text);
		const state = ok ? 'ok' : 'error';
		if (type === 'url') {
			copiedWebhookUrl = state;
			setTimeout(() => copiedWebhookUrl = null, 2000);
		} else {
			copiedWebhookSecret = state;
			setTimeout(() => copiedWebhookSecret = null, 2000);
		}
	}

	async function loadEnvFiles() {
		if (!gitStack) return;

		loadingEnvFiles = true;
		try {
			const response = await fetch(`/api/git/stacks/${gitStack.id}/env-files`);
			if (response.ok) {
				const data = await response.json();
				envFiles = data.files || [];
			}
		} catch (e) {
			console.error('Failed to load env files:', e);
		} finally {
			loadingEnvFiles = false;
		}
	}

	async function loadEnvFileContents(path: string) {
		if (!gitStack || !path) {
			fileEnvVars = {};
			return;
		}

		loadingFileVars = true;
		try {
			const response = await fetch(`/api/git/stacks/${gitStack.id}/env-files`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path })
			});
			if (response.ok) {
				const data = await response.json();
				fileEnvVars = data.vars || {};
			}
		} catch (e) {
			console.error('Failed to load env file contents:', e);
			fileEnvVars = {};
		} finally {
			loadingFileVars = false;
		}
	}

	async function loadEnvVarsOverrides() {
		if (!gitStack) return;

		try {
			// Use gitStack.environmentId when editing, fall back to prop for new stacks
			const envIdToUse = gitStack.environmentId ?? environmentId;
			const response = await fetch(`/api/stacks/${encodeURIComponent(gitStack.stackName)}/env${envIdToUse ? `?env=${envIdToUse}` : ''}`);
			if (response.ok) {
				const data = await response.json();
				const loadedVars = data.variables || [];
				// Track existing secret keys (secrets loaded from DB cannot have visibility toggled)
				existingSecretKeys = new Set(
					loadedVars.filter((v: EnvVar) => v.isSecret && v.key.trim()).map((v: EnvVar) => v.key.trim())
				);
				// Set envVars - the panel's $effect will auto-sync rawContent for text view
				envVars = loadedVars;
				injectedSecretKeys = data.injectedSecretKeys ?? [];
			}
		} catch (e) {
			console.error('Failed to load env var overrides:', e);
		}
	}

	async function populateEnvVars() {
		// Validate we have repository info
		if (formRepoMode === 'existing' && !formRepositoryId) {
			toast.error(m.stacks_git_modal_toast_select_repo_first());
			return;
		}
		if (formRepoMode === 'new' && !formNewRepoUrl.trim()) {
			toast.error(m.stacks_git_modal_toast_enter_repo_url_first());
			return;
		}

		populatingEnvVars = true;
		try {
			const body: Record<string, any> = {
				composePath: formComposePath || 'compose.yaml',
				envFilePath: formEnvFilePath || null
			};

			if (formRepoMode === 'existing') {
				body.repositoryId = formRepositoryId;
				// Send the selected branch so env files are previewed from it (per-stack override)
				body.branch = formBranch || undefined;
			} else {
				body.url = formNewRepoUrl;
				body.branch = formNewRepoBranch || 'main';
				body.credentialId = formNewRepoCredentialId;
			}

			const response = await fetch('/api/git/preview-env', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = await response.json();

			if (!response.ok) {
				toast.error(m.stacks_git_modal_toast_load_env_failed(), {
					description: data.error || m.stacks_git_modal_error_unknown()
				});
				return;
			}

			const vars = data.vars as Record<string, string>;
			const count = Object.keys(vars).length;

			if (count === 0) {
				toast.info(m.stacks_git_modal_toast_no_env_found(), {
					description: m.stacks_git_modal_toast_no_env_found_description()
				});
				return;
			}

			// Convert to EnvVar array - preserve existing user entries that aren't in repo
			const existingUserVars = envVars.filter(v => v.key.trim() && !(v.key in vars));
			const newVars: EnvVar[] = Object.entries(vars).map(([key, value]) => ({
				key,
				value,
				isSecret: false
			}));

			envVars = [...newVars, ...existingUserVars];
			fileEnvVars = vars;

			toast.success(m.stacks_git_modal_toast_loaded_variables({ count, plural: count === 1 ? '' : 's' }), {
				description: m.stacks_git_modal_toast_loaded_variables_description()
			});
		} catch (e) {
			console.error('Failed to populate env vars:', e);
			toast.error(m.stacks_git_modal_toast_load_env_failed());
		} finally {
			populatingEnvVars = false;
		}
	}

	async function resetForm() {
		// Clear state BEFORE async loads to avoid race conditions
		activeTab = 'settings';
		stackVolumes = [];
		stackVolumesLoaded = false;
		backupTally = { ok: 0, failed: 0 };
		backupTallyLoaded = false;
		formError = '';
		errors = {};
		copiedWebhookUrl = null;
		copiedWebhookSecret = null;
		envFiles = [];
		envVars = [];
		fileEnvVars = {};
		existingSecretKeys = new Set();

		if (gitStack) {
			formRepoMode = 'existing';
			formRepositoryId = gitStack.repositoryId;
			formStackName = gitStack.stackName;
			if ($page.data.backupsEnabled) void loadBackupTally();
			formComposePath = gitStack.composePath;
			formEnvFilePath = gitStack.envFilePath;
			formAutoUpdate = gitStack.autoUpdate;
			formAutoUpdateCron = gitStack.autoUpdateCron || '0 3 * * *';
			formWebhookEnabled = gitStack.webhookEnabled;
			formWebhookSecret = gitStack.webhookSecret || '';
			formContextDir = gitStack.contextDir ?? null;
			formBuildOnDeploy = gitStack.buildOnDeploy ?? false;
			formNoBuildCache = gitStack.noBuildCache ?? false;
			formRepullImages = gitStack.repullImages ?? false;
			formForceRedeploy = gitStack.forceRedeploy ?? false;
			formDeployNow = false;
			formSecretProviderId = null;

			// Load secret provider binding
			loadSecretProviderBindingForStack(gitStack.stackName);
			// Per-stack branch override; null means "use the repository default"
			formBranch = gitStack.branch ?? null;

			// Load env files and overrides SYNCHRONOUSLY to avoid race conditions
			// Wait for all loads to complete before allowing any other effect to run
			await Promise.all([
				loadEnvFiles(),
				loadEnvVarsOverrides(),
				gitStack.envFilePath ? loadEnvFileContents(gitStack.envFilePath) : Promise.resolve()
			]);
		} else {
			formRepoMode = repositories.length > 0 ? 'existing' : 'new';
			formRepositoryId = null;
			formNewRepoName = '';
			formNewRepoUrl = '';
			formNewRepoBranch = 'main';
			formNewRepoCredentialId = null;
			formStackName = '';
			formStackNameUserModified = false;
			formComposePath = 'compose.yaml';
			formEnvFilePath = null;
			formAutoUpdate = false;
			formAutoUpdateCron = '0 3 * * *';
			formWebhookEnabled = false;
			formWebhookSecret = '';
			formContextDir = null;
			formBuildOnDeploy = false;
			formNoBuildCache = false;
			formRepullImages = false;
			formForceRedeploy = false;
			formDeployNow = false;
			formSecretProviderId = null;
		}
	}

	async function loadSecretProviderBindingForStack(stackName: string) {
		try {
			const url = environmentId ? `/api/stacks/sources?env=${environmentId}` : '/api/stacks/sources';
			const response = await fetch(url);
			if (!response.ok) return;
			const sourceMap = await response.json();
			const source = sourceMap?.[stackName];
			formSecretProviderId = source?.secretProviderId ?? null;
		} catch (e) {
			console.warn('Failed to load secret provider binding for git stack:', e);
		}
	}

	async function fetchBranches() {
		const seq = ++branchesFetchSeq;
		branchesLoading = true;
		branches = [];
		try {
			const body: Record<string, any> = {};
			if (formRepoMode === 'existing' && formRepositoryId) {
				body.repositoryId = formRepositoryId;
			} else if (formRepoMode === 'new' && formNewRepoUrl) {
				body.url = formNewRepoUrl;
				body.credentialId = formNewRepoCredentialId;
			} else {
				return;
			}
			const response = await fetch('/api/git/branches', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			// A newer fetch (or a repo change) superseded this one — drop the
			// stale response so it cannot overwrite the new repo's branch list.
			if (seq !== branchesFetchSeq) return;
			if (response.ok) {
				const data = await response.json();
				if (seq !== branchesFetchSeq) return;
				branches = data.branches || [];
			}
		} catch (e) {
			if (seq !== branchesFetchSeq) return;
			console.error('Failed to fetch branches:', e);
		} finally {
			if (seq === branchesFetchSeq) branchesLoading = false;
		}
	}

	async function saveGitStack(deployAfterSave: boolean = false) {
		errors = {};
		let hasErrors = false;

		const trimmedStackName = formStackName.trim();
		if (!trimmedStackName) {
			errors.stackName = m.stacks_modal_error_stack_name_required();
			hasErrors = true;
		} else if (!STACK_NAME_REGEX.test(trimmedStackName)) {
			errors.stackName = m.stacks_git_modal_error_stack_name_invalid();
			hasErrors = true;
		}

		if (formRepoMode === 'existing' && !formRepositoryId) {
			errors.repository = m.stacks_git_modal_error_select_repository();
			hasErrors = true;
		}

		if (formRepoMode === 'new' && !formNewRepoName.trim()) {
			errors.repoName = m.stacks_git_modal_error_repo_name_required();
			hasErrors = true;
		}

		if (formRepoMode === 'new' && !formNewRepoUrl.trim()) {
			errors.repoUrl = m.stacks_git_modal_error_repo_url_required();
			hasErrors = true;
		}

		if (formWebhookEnabled && !formWebhookSecret.trim()) {
			errors.webhookSecret = m.stacks_git_modal_error_webhook_secret_required();
			hasErrors = true;
		}

		if (hasErrors) return;

		// Check if stack already exists (only for new stacks)
		if (!gitStack) {
			try {
				const stacksResponse = await fetch(`/api/stacks?env=${environmentId}`);
				if (stacksResponse.ok) {
					const stacks = await stacksResponse.json();
					const existingStack = stacks.find((s: { name: string }) =>
						s.name.toLowerCase() === formStackName.trim().toLowerCase()
					);
					if (existingStack) {
						showExistsWarning = true;
						return;
					}
				}
			} catch (e) {
				console.warn('Failed to check for existing stacks:', e);
			}
		}

		formSaving = true;
		formError = '';

		try {
			// Only save vars that are actual overrides (differ from file) or new (not in file)
			// This ensures file updates from git are picked up on next sync
			const overrideVars = envVars.filter(v => {
				if (!v.key.trim()) return false;
				const fileValue = fileEnvVars[v.key];
				// Save if: not in file (new var), value differs from file, or is a secret
				return fileValue === undefined || v.value !== fileValue || v.isSecret;
			});

			let body: any = {
				stackName: formStackName,
				composePath: formComposePath || 'compose.yaml',
				envFilePath: formEnvFilePath,
				environmentId: environmentId,
				autoUpdate: formAutoUpdate,
				autoUpdateCron: formAutoUpdateCron,
				webhookEnabled: formWebhookEnabled,
				webhookSecret: formWebhookEnabled ? formWebhookSecret : null,
				contextDir: formContextDir || null,
				buildOnDeploy: formBuildOnDeploy,
				noBuildCache: formNoBuildCache,
				repullImages: formRepullImages,
				forceRedeploy: formForceRedeploy,
				deployNow: deployAfterSave,
				secretProviderId: formSecretProviderId,
				envVars: overrideVars.map(v => ({
					key: v.key.trim(),
					value: v.value,
					isSecret: v.isSecret
				}))
			};

			if (formRepoMode === 'existing') {
				body.repositoryId = formRepositoryId;
				// Per-stack branch override — sent on both create and update so the
				// stack payload is the single source of truth (null = inherit repo default)
				body.branch = formBranch || null;
			} else {
				// Create new repo inline
				body.repoName = formNewRepoName;
				body.url = formNewRepoUrl;
				body.branch = formNewRepoBranch || 'main';
				body.credentialId = formNewRepoCredentialId;
			}

			const url = gitStack
				? `/api/git/stacks/${gitStack.id}`
				: '/api/git/stacks';
			const method = gitStack ? 'PUT' : 'POST';

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = await readJobResponse(response);

			if (!response.ok) {
				formError = data.error || m.stacks_git_modal_error_save_failed();
				return;
			}

			// Check if deployment failed
			const deployResult = data.deployResult as { success?: boolean; error?: string } | undefined;
			if (deployResult && !deployResult.success) {
				toast.error(m.stacks_git_modal_toast_deployment_failed(), {
					description: deployResult.error || m.stacks_git_modal_error_unknown()
				});
				onSaved(); // Still refresh the list to show the new stack
				onClose(); // Close modal, error shown as toast
				return;
			}

			onSaved();
			onClose();
		} catch (error) {
			formError = m.stacks_git_modal_error_save_failed();
		} finally {
			formSaving = false;
		}
	}

	// Fetch branches when repository selection changes
	$effect(() => {
		if (formRepoMode === 'existing' && formRepositoryId) {
			void fetchBranches();
			// A fresh stack inherits the repository's default until a branch is
			// picked. When editing, the stored per-stack override (set in
			// resetForm) must be preserved — null means repository default.
			if (!gitStack) formBranch = null;
		} else if (formRepoMode === 'new' && formNewRepoUrl) {
			void fetchBranches();
		} else {
			branches = [];
		}
	});

	// Auto-populate stack name from selected repo and compose path (only if user hasn't manually edited)
	$effect(() => {
		if (formRepoMode === 'existing' && formRepositoryId && !gitStack && !formStackNameUserModified) {
			const repo = repositories.find(r => r.id === formRepositoryId);
			if (repo) {
				// Normalize repo name: lowercase, spaces/underscores to hyphens, strip invalid chars
				const normalizedName = repo.name
					.toLowerCase()
					.replace(/[\s_]+/g, '-')
					.replace(/[^a-z0-9-]/g, '')
					.replace(/-+/g, '-')
					.replace(/^-|-$/g, '');

				// Extract compose filename without extension for stack name
				const composeName = formComposePath
					.replace(/^.*\//, '') // Remove directory path
					.replace(/\.(yml|yaml)$/i, '') // Remove extension
					.replace(/^docker-compose\.?/, '') // Remove docker-compose prefix
					.replace(/^compose$/, ''); // Remove plain "compose"

				// Combine repo name with compose name if it's not the default
				if (composeName && composeName !== 'docker-compose') {
					formStackName = `${normalizedName}-${composeName}`;
				} else {
					formStackName = normalizedName;
				}
			}
		}
	});
</script>

<Dialog.Root bind:open onOpenChange={(isOpen) => { if (isOpen) focusFirstInput(); }}>
	<Dialog.Content
		class="max-w-none w-[calc(100vw-4rem)] h-[95vh] flex flex-col p-0 gap-0 shadow-xl border-zinc-200 dark:border-zinc-700"
		showCloseButton={false}
	>
		<Dialog.Header class="px-5 py-3 border-b border-zinc-200 dark:border-zinc-700 flex-shrink-0">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<div class="p-1.5 rounded-md bg-zinc-200 dark:bg-zinc-700">
						<GitBranch class="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
					</div>
					<div>
						<Dialog.Title class="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
							{gitStack ? m.stacks_action_edit_git() : m.stacks_git_modal_title_deploy()}
						</Dialog.Title>
						<Dialog.Description class="text-xs text-zinc-500 dark:text-zinc-400">
							{gitStack ? m.stacks_git_modal_description_edit() : m.stacks_git_modal_description_deploy()}
						</Dialog.Description>
					</div>
				</div>

				<!-- Close button -->
				<button
					onclick={onClose}
					class="p-1.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
				>
					<X class="w-4 h-4" />
				</button>
			</div>
		</Dialog.Header>

		<!-- Tabs: Settings (deploy form) + Backups. Backups only in edit mode AND when
		     the backups feature flag is on (BETA GATE) — a git stack must exist before
		     it can be backed up, and the feature must be enabled. -->
		{#if gitStack && $page.data.backupsEnabled}
			<div class="flex items-center gap-1 border-b border-zinc-200 px-5 dark:border-zinc-700 flex-shrink-0">
				<button
					type="button"
					class="relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors {activeTab === 'settings' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
					onclick={() => (activeTab = 'settings')}
				>
					<Settings2 class="h-3.5 w-3.5" />{m.sidebar_settings()}</button>
				<button
					type="button"
					class="relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors {activeTab === 'backups' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}"
					onclick={() => (activeTab = 'backups')}
				>
					<Archive class="h-3.5 w-3.5" /> {m.sidebar_backups()}
					{#if backupTally.ok > 0}<span class="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-medium text-emerald-500"><Check class="w-2.5 h-2.5" />{backupTally.ok}</span>{/if}
					{#if backupTally.failed > 0}<span class="inline-flex items-center gap-0.5 rounded-full bg-red-500/15 px-1.5 text-[10px] font-semibold text-red-500"><X class="w-2.5 h-2.5" />{backupTally.failed}</span>{/if}
				</button>
			</div>
		{/if}

		{#if activeTab === 'backups' && gitStack && $page.data.backupsEnabled}
			<div class="min-h-0 flex-1 overflow-auto p-5">
				<BackupPanel
					containerName={formStackName}
					volumes={stackVolumes}
					type="stack"
					environmentId={effectiveEnvId ?? undefined}
					onTally={(t) => (backupTally = t)}
				/>
			</div>
		{:else}
		<div bind:this={containerRef} class="flex-1 min-h-0 flex {isDraggingSplit ? 'select-none' : ''}">
			<!-- Left column: Form fields -->
			<div class="flex-shrink-0 flex flex-col min-w-0 overflow-y-auto" style="width: {splitRatio}%">
				<div class="space-y-4 py-4 px-6">
			<!-- Repository selection -->
			{#if !gitStack}
				<div class="space-y-3">
					<Label>{m.stacks_git_modal_label_repository()}</Label>
					<div class="flex gap-2">
						<Button
							variant={formRepoMode === 'existing' ? 'default' : 'outline'}
							size="sm"
							onclick={() => formRepoMode = 'existing'}
							disabled={repositories.length === 0}
						>
							{m.stacks_git_modal_button_select_existing()}
						</Button>
						<Button
							variant={formRepoMode === 'new' ? 'default' : 'outline'}
							size="sm"
							onclick={() => formRepoMode = 'new'}
						>
							{m.stacks_git_modal_button_add_new()}
						</Button>
					</div>

					{#if formRepoMode === 'existing'}
						<Select.Root
							type="single"
							value={formRepositoryId?.toString() ?? ''}
							onValueChange={(v) => { formRepositoryId = v ? parseInt(v) : null; errors.repository = undefined; }}
						>
							<Select.Trigger class="w-full {errors.repository ? 'border-destructive' : ''}">
								{#if selectedRepo}
									{@const repoPath = selectedRepo.url.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '')}
									<div class="flex items-center gap-2 text-left">
										{#if selectedRepo.url.includes('github.com')}
											<Github class="w-4 h-4 shrink-0 text-muted-foreground" />
										{:else}
											<FolderGit2 class="w-4 h-4 shrink-0 text-muted-foreground" />
										{/if}
										<span class="truncate">{selectedRepo.name}</span>
										<span class="text-muted-foreground text-xs truncate hidden sm:inline">({repoPath})</span>
									</div>
								{:else}
									<span class="text-muted-foreground">{m.stacks_git_modal_select_placeholder()}</span>
								{/if}
							</Select.Trigger>
							<Select.Content>
								{#each repositories as repo}
									{@const repoPath = repo.url.replace(/^https?:\/\/[^/]+\//, '').replace(/\.git$/, '')}
									<Select.Item value={repo.id.toString()} label={repo.name}>
										<div class="flex items-center gap-2">
											{#if repo.url.includes('github.com')}
												<Github class="w-4 h-4 shrink-0 text-muted-foreground" />
											{:else}
												<FolderGit2 class="w-4 h-4 shrink-0 text-muted-foreground" />
											{/if}
											<span>{repo.name}</span>
											<span class="text-muted-foreground text-xs">- {repoPath}</span>
											<span class="text-muted-foreground text-xs flex items-center gap-1">
												<GitBranch class="w-3 h-3" />
												{repo.branch}
											</span>
										</div>
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						{#if errors.repository}
							<p class="text-xs text-destructive">{errors.repository}</p>
						{:else if repositories.length === 0}
							<p class="text-xs text-muted-foreground">{m.stacks_git_modal_no_repositories_hint()}</p>
						{/if}
						<!-- Branch selection for existing repository -->
						{#if formRepoMode === 'existing' && selectedRepo}
							<div class="space-y-2">
								<Label for="existing-repo-branch">{m.stacks_git_modal_label_branch()}</Label>
								<BranchCombobox
									id="existing-repo-branch"
									value={formBranch ?? ''}
									branches={branches}
									defaultBranch={selectedRepo.branch}
									loading={branchesLoading}
									placeholder={m.stacks_git_modal_repository_default({ branch: selectedRepo.branch })}
									clearLabel={m.stacks_git_modal_repository_default({ branch: selectedRepo.branch })}
									onchange={(v) => { formBranch = v; }}
									onclear={() => { formBranch = null; }}
								/>
								<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_branch_override({ branch: selectedRepo.branch })}</p>
							</div>
						{/if}
					{:else}
						<div class="space-y-3 p-3 border rounded-md bg-muted/30">
							<div class="space-y-2">
								<Label for="new-repo-name">{m.images_repository_name()}</Label>
								<Input
									id="new-repo-name"
									bind:value={formNewRepoName}
									placeholder={m.stacks_git_modal_placeholder_repo_name()}
									class={errors.repoName ? 'border-destructive focus-visible:ring-destructive' : ''}
									oninput={() => errors.repoName = undefined}
								/>
								{#if errors.repoName}
									<p class="text-xs text-destructive">{errors.repoName}</p>
								{/if}
							</div>
							<div class="space-y-2">
								<Label for="new-repo-url">{m.stacks_git_modal_label_repo_url()}</Label>
								<Input
									id="new-repo-url"
									bind:value={formNewRepoUrl}
									placeholder={m.stacks_git_modal_placeholder_repo_url()}
									class={errors.repoUrl ? 'border-destructive focus-visible:ring-destructive' : ''}
									oninput={() => errors.repoUrl = undefined}
								/>
								{#if errors.repoUrl}
									<p class="text-xs text-destructive">{errors.repoUrl}</p>
								{/if}
							</div>
							<div class="grid grid-cols-2 items-start gap-3">
								<div class="space-y-2">
									<Label for="new-repo-branch">{m.stacks_git_modal_label_branch()}</Label>
									<!-- Free-text, searchable branch picker. Supports both discovered
									     branches and arbitrary typed names: a new/private repository whose
									     branch enumeration fails must not force the user onto "main" — they
									     can type the known branch name instead. The "main" default is
									     preserved when no branch has been chosen, and a value not returned by
									     enumeration is never silently reset. Server-side Git ref validation
									     remains authoritative. -->
									<BranchCombobox
										id="new-repo-branch"
										class="w-full"
										value={formNewRepoBranch}
										branches={branches}
										loading={branchesLoading}
										placeholder="main"
										onchange={(v) => { formNewRepoBranch = v; }}
										onclear={() => { formNewRepoBranch = 'main'; }}
									/>
									<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_branch_type()}</p>
								</div>
								<div class="space-y-2">
									<Label for="new-repo-credential">{m.stacks_git_modal_label_credential()}</Label>
									<Select.Root
										type="single"
										value={formNewRepoCredentialId?.toString() ?? 'none'}
										onValueChange={(v) => formNewRepoCredentialId = v === 'none' ? null : parseInt(v)}
									>
										<Select.Trigger class="w-full">
											{@const selectedCred = credentials.find(c => c.id === formNewRepoCredentialId)}
											{#if selectedCred}
												{#if selectedCred.authType === 'ssh'}
													<KeyRound class="w-4 h-4 mr-2 text-muted-foreground" />
												{:else if selectedCred.authType === 'password'}
													<Lock class="w-4 h-4 mr-2 text-muted-foreground" />
												{:else}
													<Key class="w-4 h-4 mr-2 text-muted-foreground" />
												{/if}
												<span>{selectedCred.name} ({getAuthLabel(selectedCred.authType)})</span>
											{:else}
												<Key class="w-4 h-4 mr-2 text-muted-foreground" />
												<span>{m.stacks_git_modal_credential_none()}</span>
											{/if}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="none">
												<span class="flex items-center gap-2">
													<Key class="w-4 h-4 text-muted-foreground" />{m.stacks_git_modal_credential_none()}</span>
											</Select.Item>
											{#each credentials as cred}
												<Select.Item value={cred.id.toString()}>
													<span class="flex items-center gap-2">
														{#if cred.authType === 'ssh'}
															<KeyRound class="w-4 h-4 text-muted-foreground" />
														{:else if cred.authType === 'password'}
															<Lock class="w-4 h-4 text-muted-foreground" />
														{:else}
															<Key class="w-4 h-4 text-muted-foreground" />
														{/if}
														{cred.name} ({getAuthLabel(cred.authType)})
													</span>
												</Select.Item>
											{/each}
										</Select.Content>
									</Select.Root>
									<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_credential()}</p>
								</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Stack configuration -->
			<div class="space-y-2">
				<Label for="stack-name">{m.stacks_modal_stack_name()}</Label>
				<Input
					id="stack-name"
					bind:value={formStackName}
					placeholder={m.stacks_git_modal_placeholder_stack_name()}
					class={errors.stackName ? 'border-destructive focus-visible:ring-destructive' : ''}
					oninput={() => { errors.stackName = undefined; formStackNameUserModified = true; }}
				/>
				{#if errors.stackName}
					<p class="text-xs text-destructive">{errors.stackName}</p>
				{:else}
					<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_stack_name()}</p>
				{/if}
			</div>

			{#if gitStack && selectedRepo}
				<div class="space-y-2">
					<Label>{m.stacks_git_modal_label_repository()}</Label>
					<div class="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
						<FolderGit2 class="w-4 h-4 shrink-0" />
						<span class="truncate" title={selectedRepo.url}>{selectedRepo.url}</span>
					</div>
				</div>
			{/if}

			{#if gitStack && selectedRepo}
				<div class="space-y-2">
					<Label for="stack-branch">{m.stacks_git_modal_label_branch()}</Label>
					<BranchCombobox
						id="stack-branch"
						value={formBranch ?? ''}
						branches={branches}
						defaultBranch={selectedRepo.branch}
						loading={branchesLoading}
						placeholder={m.stacks_git_modal_repository_default({ branch: selectedRepo.branch })}
						clearLabel={m.stacks_git_modal_repository_default({ branch: selectedRepo.branch })}
						onchange={(v) => { formBranch = v; }}
						onclear={() => { formBranch = null; }}
					/>
					<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_branch_override({ branch: selectedRepo.branch })}</p>
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="compose-path">{m.stacks_git_modal_label_compose_path()}</Label>
				<Input id="compose-path" bind:value={formComposePath} placeholder="compose.yaml" />
				<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_compose_path()}</p>
			</div>

			<!-- Additional env file for variable substitution -->
			<div class="space-y-2">
				<div class="flex items-center gap-1.5">
					<Label for="env-file-path">{m.stacks_git_modal_label_env_file()}</Label>
					<Tooltip.Root>
						<Tooltip.Trigger>
							<HelpCircle class="w-3.5 h-3.5 text-muted-foreground cursor-help" />
						</Tooltip.Trigger>
						<Tooltip.Content>
							<div class="w-80">
								<p class="text-xs">{@html m.stacks_git_modal_tooltip_env_file_1()}</p>
								<p class="text-xs mt-2">{@html m.stacks_git_modal_tooltip_env_file_2()}</p>
								<p class="text-xs mt-2">{m.stacks_git_modal_tooltip_env_file_3()}</p>
							</div>
						</Tooltip.Content>
					</Tooltip.Root>
				</div>
					<Input
						id="env-file-path"
						bind:value={formEnvFilePath}
						placeholder=""
					/>
				<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_env_file()}</p>
			</div>

			<!-- Context directory -->
			<div class="space-y-2">
				<div class="flex items-center gap-1.5">
					<Label for="context-dir">{m.stacks_git_modal_label_context_dir()}</Label>
					<Tooltip.Root>
						<Tooltip.Trigger>
							<HelpCircle class="w-3.5 h-3.5 text-muted-foreground cursor-help" />
						</Tooltip.Trigger>
						<Tooltip.Content>
							<div class="w-80">
								<p class="text-xs">{m.stacks_git_modal_tooltip_context_dir_1()}</p>
								<p class="text-xs mt-2">{@html m.stacks_git_modal_tooltip_context_dir_2()}</p>
								<p class="text-xs mt-2">{m.stacks_git_modal_tooltip_context_dir_3()}</p>
							</div>
						</Tooltip.Content>
					</Tooltip.Root>
				</div>
				<Input
					id="context-dir"
					value={formContextDir ?? ''}
					oninput={(e) => { const v = (e.target as HTMLInputElement).value; formContextDir = v.trim() || null; }}
					placeholder={m.stacks_git_modal_placeholder_context_dir()}
				/>
				<p class="text-xs text-muted-foreground">{@html m.stacks_git_modal_hint_context_dir()}</p>
			</div>

			<!-- Auto-update section -->
			<div class="space-y-3 p-3 bg-muted/50 rounded-md">
			<div class="flex items-center gap-3">
				<div class="flex items-center gap-2 flex-1">
					<RefreshCw class="w-4 h-4 text-muted-foreground" />
					<Label class="text-sm font-normal">{m.stacks_git_modal_label_enable_scheduled_sync()}</Label>
				</div>
				<TogglePill bind:checked={formAutoUpdate} />
			</div>
				<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_scheduled_sync()}</p>
				{#if formAutoUpdate}
					<CronEditor
						value={formAutoUpdateCron}
						onchange={(cron) => formAutoUpdateCron = cron}
					/>
				{/if}
			</div>

			<!-- Webhook section -->
			<div class="space-y-3 p-3 bg-muted/50 rounded-md">
			<div class="flex items-center gap-3">
				<div class="flex items-center gap-2 flex-1">
					<Webhook class="w-4 h-4 text-muted-foreground" />
					<Label class="text-sm font-normal">{m.stacks_git_modal_label_enable_webhook()}</Label>
				</div>
				<TogglePill
					bind:checked={formWebhookEnabled}
					onchange={() => { if (formWebhookEnabled && !formWebhookSecret) formWebhookSecret = generateWebhookSecret(); }}
				/>
			</div>
				<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_webhook()}</p>
				{#if formWebhookEnabled}
					{#if gitStack}
						<div class="space-y-2">
							<Label>{m.stacks_git_modal_label_webhook_url()}</Label>
							<div class="flex gap-2">
								<Input
									value={getWebhookUrl(gitStack.id)}
									readonly
									class="font-mono text-xs bg-background"
								/>
								<Button
									variant="outline"
									size="sm"
									onclick={() => copyWebhookField(getWebhookUrl(gitStack.id), 'url')}
									title={m.stacks_git_modal_button_copy_url()}
								>
									{#if copiedWebhookUrl === 'error'}
										<Tooltip.Root open>
											<Tooltip.Trigger>
												<XCircle class="w-4 h-4 text-red-500" />
											</Tooltip.Trigger>
											<Tooltip.Content>{m.profile_mfa_backup_copy_https()}</Tooltip.Content>
										</Tooltip.Root>
									{:else if copiedWebhookUrl === 'ok'}
										<Check class="w-4 h-4 text-green-500" />
									{:else}
										<Copy class="w-4 h-4" />
									{/if}
								</Button>
							</div>
						</div>
					{/if}
					<div class="space-y-2">
						<Label for="webhook-secret">{m.stacks_git_modal_label_webhook_secret()}</Label>
						<div class="flex gap-2">
							<Input
								id="webhook-secret"
								bind:value={formWebhookSecret}
								placeholder={m.stacks_git_modal_placeholder_webhook_secret()}
								class="font-mono text-xs {errors.webhookSecret ? 'border-destructive focus-visible:ring-destructive' : ''}"
								oninput={() => errors.webhookSecret = undefined}
							/>
							{#if gitStack && formWebhookSecret}
								<Button
									variant="outline"
									size="sm"
									onclick={() => copyWebhookField(formWebhookSecret, 'secret')}
									title={m.stacks_git_modal_button_copy_secret()}
								>
									{#if copiedWebhookSecret === 'error'}
										<Tooltip.Root open>
											<Tooltip.Trigger>
												<XCircle class="w-4 h-4 text-red-500" />
											</Tooltip.Trigger>
											<Tooltip.Content>{m.profile_mfa_backup_copy_https()}</Tooltip.Content>
										</Tooltip.Root>
									{:else if copiedWebhookSecret === 'ok'}
										<Check class="w-4 h-4 text-green-500" />
									{:else}
										<Copy class="w-4 h-4" />
									{/if}
								</Button>
							{/if}
							<Tooltip.Root>
								<Tooltip.Trigger>
									<Button
										variant="outline"
										size="sm"
										onclick={() => formWebhookSecret = generateWebhookSecret()}
									>
										<Key class="w-4 h-4" />
									</Button>
								</Tooltip.Trigger>
								<Tooltip.Content>{m.stacks_git_modal_button_generate_secret()}</Tooltip.Content>
							</Tooltip.Root>
						</div>
						{#if errors.webhookSecret}
							<p class="text-xs text-destructive">{errors.webhookSecret}</p>
						{/if}
					</div>
					{#if !gitStack}
						<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_webhook_url_after_create()}</p>
					{:else}
						<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_webhook_configure()}</p>
					{/if}
				{/if}
			</div>

			<!-- Deploy options section -->
			<div class="space-y-3 p-3 bg-muted/50 rounded-md">
				<p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{m.stacks_git_modal_section_deploy_options()}</p>
				<div class="flex items-center gap-3">
					<div class="flex items-center gap-2 flex-1">
						<Hammer class="w-4 h-4 text-muted-foreground" />
						<Label class="text-sm font-normal">{m.stacks_git_modal_label_build_on_deploy()}</Label>
					</div>
					<TogglePill bind:checked={formBuildOnDeploy} />
				</div>
				<p class="text-xs text-muted-foreground">{@html m.stacks_git_modal_hint_build_on_deploy()}</p>
				{#if formBuildOnDeploy}
				<div class="flex items-center gap-3 ml-6">
					<div class="flex items-center gap-2 flex-1">
						<Ban class="w-4 h-4 text-muted-foreground" />
						<Label class="text-sm font-normal">{m.stacks_git_modal_label_disable_build_cache()}</Label>
					</div>
					<TogglePill bind:checked={formNoBuildCache} />
				</div>
				<p class="text-xs text-muted-foreground ml-6">{@html m.stacks_git_modal_hint_disable_build_cache()}</p>
				{/if}
				<div class="flex items-center gap-3">
					<div class="flex items-center gap-2 flex-1">
						<ArrowDownToLine class="w-4 h-4 text-muted-foreground" />
						<Label class="text-sm font-normal">{m.stacks_git_modal_label_repull_images()}</Label>
					</div>
					<TogglePill bind:checked={formRepullImages} />
				</div>
				<p class="text-xs text-muted-foreground">{@html m.stacks_git_modal_hint_repull_images()}</p>
				<div class="flex items-center gap-3">
					<div class="flex items-center gap-2 flex-1">
						<Zap class="w-4 h-4 text-muted-foreground" />
						<Label class="text-sm font-normal">{m.stacks_git_modal_label_force_redeploy()}</Label>
					</div>
					<TogglePill bind:checked={formForceRedeploy} />
				</div>
				<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_force_redeploy()}</p>
			</div>

			<!-- Deploy now option (only for new stacks) -->
			{#if !gitStack}
				<div class="space-y-3 p-3 bg-muted/50 rounded-md">
					<div class="flex items-center gap-3">
						<div class="flex items-center gap-2 flex-1">
							<Rocket class="w-4 h-4 text-muted-foreground" />
							<div class="flex-1">
								<Label class="text-sm font-normal">{m.stacks_git_modal_label_deploy_now()}</Label>
								<p class="text-xs text-muted-foreground">{m.stacks_git_modal_hint_deploy_now()}</p>
							</div>
						</div>
						<TogglePill bind:checked={formDeployNow} />
					</div>
				</div>
			{/if}

			{#if formError}
				<p class="text-sm text-destructive">{formError}</p>
			{/if}
				</div>
			</div>

			<!-- Resizable divider -->
			<div
				class="w-1 flex-shrink-0 bg-zinc-200 dark:bg-zinc-700 hover:bg-blue-400 dark:hover:bg-blue-500 cursor-col-resize transition-colors flex items-center justify-center group {isDraggingSplit ? 'bg-blue-500 dark:bg-blue-400' : ''}"
				onmousedown={startSplitDrag}
				role="separator"
				aria-orientation="vertical"
				tabindex="0"
			>
				<div class="w-4 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity {isDraggingSplit ? 'opacity-100' : ''}">
					<GripVertical class="w-3 h-3 text-white" />
				</div>
			</div>

			<!-- Right column: Environment Variables -->
			<div class="flex-1 min-w-0 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-800/50">
				<SecretProviderPicker
					bind:secretProviderId={formSecretProviderId}
					bind:envVars
					providers={secretProviders}
				/>
				<StackEnvVarsPanel
					bind:variables={envVars}
					injectedSecretKeys={gitStack !== null ? injectedSecretKeys : []}
					providerType={secretProviders.find((p) => p.id === formSecretProviderId)?.type ?? null}
					providerName={secretProviders.find((p) => p.id === formSecretProviderId)?.name ?? null}
					placeholder={{ key: 'MY_VAR', value: 'value' }}
					infoText={m.stacks_git_modal_env_panel_info({ syntax: '${VAR_NAME}' })}
					existingSecretKeys={gitStack !== null ? existingSecretKeys : new Set()}
					showInterpolationHint={true}
				>
					{#snippet headerActions()}
						{#if !gitStack}
							<div class="flex items-center gap-0.5">
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onclick={populateEnvVars}
									disabled={populatingEnvVars || (formRepoMode === 'existing' && !formRepositoryId) || (formRepoMode === 'new' && !formNewRepoUrl.trim())}
									class="h-6 text-xs px-2"
								>
									{#if populatingEnvVars}
										<Loader2 class="w-3.5 h-3.5 mr-1 animate-spin" />
										{m.common_loading()}
									{:else}
										<Download class="w-3.5 h-3.5" />
										{m.stacks_git_modal_button_populate()}
									{/if}
								</Button>
								<Tooltip.Root>
									<Tooltip.Trigger>
										<HelpCircle class="w-3.5 h-3.5 text-muted-foreground cursor-help" />
									</Tooltip.Trigger>
									<Tooltip.Content>
										<div class="w-64">
											<p class="text-xs">{@html m.stacks_git_modal_tooltip_populate()}</p>
										</div>
									</Tooltip.Content>
								</Tooltip.Root>
							</div>
						{/if}
					{/snippet}
				</StackEnvVarsPanel>
			</div>
		</div>
		{/if}

		<Dialog.Footer class="px-5 py-2.5 border-t border-zinc-200 dark:border-zinc-700 flex-shrink-0">
			<Button variant="outline" onclick={onClose}>{activeTab === 'backups' ? m.common_close() : m.common_cancel()}</Button>
			<!-- The deploy-form save buttons belong to the Settings tab. On the Backups
			     tab the backup panel manages its own saving, so only Close is shown. -->
			{#if activeTab !== 'backups'}
				{#if gitStack}
					<Button variant="outline" onclick={() => saveGitStack(true)} disabled={formSaving}>
						{#if formSaving}
							<Loader2 class="w-4 h-4 mr-1 animate-spin" />
							{m.stacks_redeploy_deploying()}
						{:else}
							<Rocket class="w-4 h-4" />
							{m.stacks_git_modal_button_save_and_deploy()}
						{/if}
					</Button>
					<Button onclick={() => saveGitStack(false)} disabled={formSaving}>
						{#if formSaving}
							<Loader2 class="w-4 h-4 mr-1 animate-spin" />
							{m.stacks_modal_button_saving()}
						{:else}
							{m.stacks_git_modal_button_save_changes()}
						{/if}
					</Button>
				{:else}
					<Button onclick={() => saveGitStack(formDeployNow)} disabled={formSaving}>
						{#if formSaving}
							<Loader2 class="w-4 h-4 mr-1 animate-spin" />
							{formDeployNow ? m.stacks_redeploy_deploying() : m.container_create_creating()}
						{:else}
							{formDeployNow ? m.common_deploy() : m.common_create()}
						{/if}
					</Button>
				{/if}
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Stack already exists warning dialog -->
<Dialog.Root bind:open={showExistsWarning}>
	<Dialog.Content class="max-w-sm">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<TriangleAlert class="w-5 h-5 text-amber-500" />{m.stacks_git_modal_exists_title()}</Dialog.Title>
			<Dialog.Description>
				{m.stacks_modal_dialog_exists_desc({ name: formStackName })}
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex justify-end mt-4">
			<Button size="sm" onclick={() => showExistsWarning = false}>
				{m.common_ok()}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
