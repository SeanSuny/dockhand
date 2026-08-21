<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import { Shield, Pencil, Plus, Check, RefreshCw, Box, Image, HardDrive, Cable, Layers, Globe, Download, Bell, Sliders, Settings, Users, Eye, SquarePlus, Play, Square, RotateCcw, Trash2, Terminal, ScrollText, Search, Upload, Plug, Unplug, Copy, GitBranch, KeyRound, Building2, Container, TriangleAlert, ClipboardList, Activity, Timer } from 'lucide-svelte';
	import EnvironmentIcon from '$lib/components/EnvironmentIcon.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { focusFirstInput } from '$lib/utils';
	import * as m from '$lib/paraglide/messages';

	export interface Role {
		id: number;
		name: string;
		description?: string;
		isSystem: boolean;
		permissions: any;
		environmentIds?: number[] | null;
		createdAt: string;
	}

	interface Environment {
		id: number;
		name: string;
		icon?: string;
	}

	interface Props {
		open: boolean;
		role?: Role | null;
		copyFrom?: Role | null;
		environments?: Environment[];
		onClose: () => void;
		onSaved: () => void;
	}

	let { open = $bindable(), role = null, copyFrom = null, environments = [], onClose, onSaved }: Props = $props();

	const isEditing = $derived(role !== null);
	const isCopying = $derived(copyFrom !== null);

	// Form state
	let formName = $state('');
	let formDescription = $state('');
	let formError = $state('');
	let formErrors = $state<{ name?: string }>({});
	let formSaving = $state(false);
	let formAllEnvironments = $state(false); // true = applies to all envs, false = specific envs
	let formEnvironmentIds = $state<number[]>([]); // selected env IDs when not all
	let formPermissions = $state<{
		containers: string[];
		images: string[];
		volumes: string[];
		networks: string[];
		stacks: string[];
		environments: string[];
		registries: string[];
		notifications: string[];
		configsets: string[];
		settings: string[];
		users: string[];
		git: string[];
		license: string[];
		audit_logs: string[];
		activity: string[];
		schedules: string[];
	}>({
		containers: [],
		images: [],
		volumes: [],
		networks: [],
		stacks: [],
		environments: [],
		registries: [],
		notifications: [],
		configsets: [],
		settings: [],
		users: [],
		git: [],
		license: [],
		audit_logs: [],
		activity: [],
		schedules: []
	});


	function categoryLabel(category: string): string {
		switch (category) {
			case 'activity':
				return m.sidebar_activity();
			case 'containers':
				return m.common_containers();
			case 'images':
				return m.sidebar_images();
			case 'volumes':
				return m.sidebar_volumes();
			case 'networks':
				return m.sidebar_networks();
			case 'stacks':
				return m.sidebar_stacks();
			case 'environments':
				return m.settings_tab_environments();
			case 'registries':
				return m.settings_tab_registries();
			case 'notifications':
				return m.settings_tab_notifications();
			case 'configsets':
				return m.settings_auth_roles_cat_configsets();
			case 'settings':
				return m.sidebar_settings();
			case 'users':
				return m.settings_auth_tab_users();
			case 'git':
				return m.settings_tab_git();
			case 'license':
				return m.settings_tab_license();
			case 'audit_logs':
				return m.settings_auth_roles_cat_audit_logs();
			default:
				return m.sidebar_schedules();
		}
	}

	// Permission definitions - separated into system and environment categories
	const systemPermissions = {
		users: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_users_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_users_create() },
			{ key: 'edit', label: m.settings_auth_role_modal_perm_users_edit() },
			{ key: 'delete', label: m.settings_auth_role_modal_perm_users_delete() }
		],
		settings: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_settings_view() },
			{ key: 'edit', label: m.settings_auth_role_modal_perm_settings_edit() }
		],
		environments: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_envs_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_envs_create() },
			{ key: 'edit', label: m.settings_auth_role_modal_perm_envs_edit() },
			{ key: 'delete', label: m.settings_auth_role_modal_perm_envs_delete() }
		],
		registries: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_registries_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_registries_create() },
			{ key: 'edit', label: m.settings_auth_role_modal_perm_registries_edit() },
			{ key: 'delete', label: m.settings_auth_role_modal_perm_registries_delete() }
		],
		notifications: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_notif_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_notif_create() },
			{ key: 'edit', label: m.settings_auth_role_modal_perm_notif_edit() },
			{ key: 'delete', label: m.settings_auth_role_modal_perm_notif_delete() },
			{ key: 'test', label: m.settings_auth_role_modal_perm_notif_test() }
		],
		configsets: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_configsets_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_configsets_create() },
			{ key: 'edit', label: m.settings_auth_role_modal_perm_configsets_edit() },
			{ key: 'delete', label: m.settings_auth_role_modal_perm_configsets_delete() }
		],
		git: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_git_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_git_create() },
			{ key: 'edit', label: m.settings_auth_role_modal_perm_git_edit() },
			{ key: 'delete', label: m.settings_auth_role_modal_perm_git_delete() }
		],
		license: [
			{ key: 'manage', label: m.settings_auth_role_modal_perm_license_manage() }
		],
		audit_logs: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_audit_view() }
		],
		schedules: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_schedules_view() },
			{ key: 'edit', label: m.settings_auth_role_modal_perm_schedules_edit() },
			{ key: 'run', label: m.settings_auth_role_modal_perm_schedules_run() }
		]
	};

	const environmentPermissions = {
		activity: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_activity_view() }
		],
		containers: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_containers_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_containers_create() },
			{ key: 'start', label: m.settings_auth_role_modal_perm_containers_start() },
			{ key: 'stop', label: m.settings_auth_role_modal_perm_containers_stop() },
			{ key: 'restart', label: m.settings_auth_role_modal_perm_containers_restart() },
			{ key: 'remove', label: m.settings_auth_role_modal_perm_containers_remove() },
			{ key: 'exec', label: m.settings_auth_role_modal_perm_containers_exec() },
			{ key: 'logs', label: m.stacks_action_view_logs() },
			{ key: 'inspect', label: m.settings_auth_role_modal_perm_containers_inspect() }
		],
		images: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_images_view() },
			{ key: 'pull', label: m.stacks_redeploy_pull_images() },
			{ key: 'push', label: m.settings_auth_role_modal_perm_images_push() },
			{ key: 'remove', label: m.settings_auth_role_modal_perm_images_remove() },
			{ key: 'build', label: m.stacks_redeploy_build_images() },
			{ key: 'inspect', label: m.settings_auth_role_modal_perm_images_inspect() }
		],
		volumes: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_volumes_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_volumes_create() },
			{ key: 'remove', label: m.settings_auth_role_modal_perm_volumes_remove() },
			{ key: 'inspect', label: m.settings_auth_role_modal_perm_volumes_inspect() }
		],
		networks: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_networks_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_networks_create() },
			{ key: 'remove', label: m.settings_auth_role_modal_perm_networks_remove() },
			{ key: 'inspect', label: m.settings_auth_role_modal_perm_networks_inspect() },
			{ key: 'connect', label: m.settings_auth_role_modal_perm_networks_connect() },
			{ key: 'disconnect', label: m.settings_auth_role_modal_perm_networks_disconnect() }
		],
		stacks: [
			{ key: 'view', label: m.settings_auth_role_modal_perm_stacks_view() },
			{ key: 'create', label: m.settings_auth_role_modal_perm_stacks_create() },
			{ key: 'start', label: m.settings_auth_role_modal_perm_stacks_start() },
			{ key: 'stop', label: m.settings_auth_role_modal_perm_stacks_stop() },
			{ key: 'remove', label: m.settings_auth_role_modal_perm_stacks_remove() },
			{ key: 'edit', label: m.settings_auth_role_modal_perm_stacks_edit() }
		]
	};

	const categoryIcons: Record<string, typeof Box> = {
		containers: Container,
		images: Image,
		volumes: HardDrive,
		networks: Cable,
		stacks: Layers,
		environments: Globe,
		registries: Download,
		notifications: Bell,
		configsets: Sliders,
		settings: Settings,
		users: Users,
		git: GitBranch,
		license: KeyRound,
		audit_logs: ClipboardList,
		activity: Activity,
		schedules: Timer
	};

	const categoryColorsSolid: Record<string, string> = {
		containers: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-800',
		images: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800',
		volumes: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800',
		networks: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-300 dark:border-green-800',
		stacks: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400 border-cyan-300 dark:border-cyan-800',
		environments: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border-indigo-300 dark:border-indigo-800',
		registries: 'bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-400 border-pink-300 dark:border-pink-800',
		notifications: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800',
		configsets: 'bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-800',
		settings: 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-700',
		users: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-800',
		git: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400 border-violet-300 dark:border-violet-800',
		license: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800',
		audit_logs: 'bg-stone-100 dark:bg-stone-950 text-stone-700 dark:text-stone-400 border-stone-300 dark:border-stone-800',
		activity: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800',
		schedules: 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 border-sky-300 dark:border-sky-800'
	};

	const permissionIcons: Record<string, typeof Eye> = {
		view: Eye,
		create: SquarePlus,
		start: Play,
		stop: Square,
		restart: RotateCcw,
		remove: Trash2,
		delete: Trash2,
		exec: Terminal,
		logs: ScrollText,
		inspect: Search,
		pull: Download,
		push: Upload,
		build: Box,
		connect: Plug,
		disconnect: Unplug,
		edit: Pencil,
		test: Play,
		run: Play,
		manage: Settings
	};

	function resetForm() {
		formName = '';
		formDescription = '';
		formError = '';
		formErrors = {};
		formSaving = false;
		formAllEnvironments = false;
		formEnvironmentIds = [];
		formPermissions = {
			containers: [],
			images: [],
			volumes: [],
			networks: [],
			stacks: [],
			environments: [],
			registries: [],
			notifications: [],
			configsets: [],
			settings: [],
			users: [],
			git: [],
			license: [],
			audit_logs: [],
			activity: [],
			schedules: []
		};
	}

	// Initialize form when role changes or modal opens
	$effect(() => {
		if (open) {
			if (role) {
				// Editing existing role
				formName = role.name;
				formDescription = role.description || '';
				// Environment scope: null = all environments
				formAllEnvironments = role.environmentIds === null || role.environmentIds === undefined;
				formEnvironmentIds = role.environmentIds ? [...role.environmentIds] : [];
				formPermissions = {
					containers: [...(role.permissions.containers || [])],
					images: [...(role.permissions.images || [])],
					volumes: [...(role.permissions.volumes || [])],
					networks: [...(role.permissions.networks || [])],
					stacks: [...(role.permissions.stacks || [])],
					environments: [...(role.permissions.environments || [])],
					registries: [...(role.permissions.registries || [])],
					notifications: [...(role.permissions.notifications || [])],
					configsets: [...(role.permissions.configsets || [])],
					settings: [...(role.permissions.settings || [])],
					users: [...(role.permissions.users || [])],
					git: [...(role.permissions.git || [])],
					license: [...(role.permissions.license || [])],
					audit_logs: [...(role.permissions.audit_logs || [])],
					activity: [...(role.permissions.activity || [])],
					schedules: [...(role.permissions.schedules || [])]
				};
				formError = '';
				formErrors = {};
				formSaving = false;
			} else if (copyFrom) {
				// Copying from existing role - new role with pre-filled permissions
				formName = `${copyFrom.name} (copy)`;
				formDescription = copyFrom.description || '';
				// Copy environment scope from source role
				formAllEnvironments = copyFrom.environmentIds === null || copyFrom.environmentIds === undefined;
				formEnvironmentIds = copyFrom.environmentIds ? [...copyFrom.environmentIds] : [];
				formPermissions = {
					containers: [...(copyFrom.permissions.containers || [])],
					images: [...(copyFrom.permissions.images || [])],
					volumes: [...(copyFrom.permissions.volumes || [])],
					networks: [...(copyFrom.permissions.networks || [])],
					stacks: [...(copyFrom.permissions.stacks || [])],
					environments: [...(copyFrom.permissions.environments || [])],
					registries: [...(copyFrom.permissions.registries || [])],
					notifications: [...(copyFrom.permissions.notifications || [])],
					configsets: [...(copyFrom.permissions.configsets || [])],
					settings: [...(copyFrom.permissions.settings || [])],
					users: [...(copyFrom.permissions.users || [])],
					git: [...(copyFrom.permissions.git || [])],
					license: [...(copyFrom.permissions.license || [])],
					audit_logs: [...(copyFrom.permissions.audit_logs || [])],
					activity: [...(copyFrom.permissions.activity || [])],
					schedules: [...(copyFrom.permissions.schedules || [])]
				};
				formError = '';
				formErrors = {};
				formSaving = false;
			} else {
				resetForm();
			}
		}
	});

	function togglePermission(category: keyof typeof formPermissions, permission: string) {
		const current = formPermissions[category];
		if (current.includes(permission)) {
			formPermissions[category] = current.filter(p => p !== permission);
		} else {
			formPermissions[category] = [...current, permission];
		}
	}

	function toggleAllPermissions(category: keyof typeof formPermissions, enable: boolean, definitions: { key: string; label: string }[]) {
		if (enable) {
			formPermissions[category] = definitions.map(p => p.key);
		} else {
			formPermissions[category] = [];
		}
	}

	function toggleEnvironment(envId: number) {
		if (formEnvironmentIds.includes(envId)) {
			formEnvironmentIds = formEnvironmentIds.filter(id => id !== envId);
		} else {
			formEnvironmentIds = [...formEnvironmentIds, envId];
		}
	}

	async function save() {
		formErrors = {};
		if (!formName.trim()) {
			formErrors.name = m.settings_auth_role_modal_err_name_required();
			return;
		}

		formSaving = true;
		formError = '';

		try {
			const url = isEditing ? `/api/roles/${role!.id}` : '/api/roles';
			const method = isEditing ? 'PUT' : 'POST';

			// null = all environments, array = specific environments
			const environmentIds = formAllEnvironments ? null : formEnvironmentIds;

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: formName.trim(),
					description: formDescription.trim() || (isEditing ? null : undefined),
					permissions: formPermissions,
					environmentIds
				})
			});

			if (response.ok) {
				open = false;
				onSaved();
			} else {
				const data = await response.json();
				if (data.error?.includes('already exists')) {
					formErrors.name = m.settings_auth_role_modal_err_name_exists();
				} else {
					formError = data.error || (isEditing ? m.settings_auth_role_modal_err_update_failed() : m.settings_auth_role_modal_err_create_failed());
				}
			}
		} catch {
			formError = (isEditing ? m.settings_auth_role_modal_err_update_failed() : m.settings_auth_role_modal_err_create_failed());
		} finally {
			formSaving = false;
		}
	}

	function handleClose() {
		open = false;
		onClose();
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => { if (o) { formError = ''; formErrors = {}; focusFirstInput(); } }}>
	<Dialog.Content class="max-w-6xl max-h-[85vh] flex flex-col overflow-hidden">
		<Dialog.Header class="flex-shrink-0">
			<Dialog.Title class="flex items-center gap-2">
				{#if isEditing}
					<Pencil class="w-5 h-5" />
					{m.settings_auth_roles_btn_edit()}
				{:else if isCopying}
					<Copy class="w-5 h-5" />
					{m.settings_auth_role_modal_title_copy()}
				{:else}
					<Shield class="w-5 h-5" />
					{m.settings_auth_role_modal_title_create()}
				{/if}
			</Dialog.Title>
			<Dialog.Description>
				{#if isEditing}
					{m.settings_auth_role_modal_desc_update()}
				{:else if isCopying}
					{m.settings_auth_role_modal_desc_copy({ name: copyFrom?.name ?? '' })}
				{:else}
					{m.settings_auth_role_modal_desc_create()}
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		{#if formError}
			<Alert.Root variant="destructive" class="flex-shrink-0">
				<TriangleAlert class="h-4 w-4" />
				<Alert.Description>{formError}</Alert.Description>
			</Alert.Root>
		{/if}
		<div class="flex-shrink-0 grid grid-cols-2 gap-4 py-4">
			<div class="space-y-2">
				<Label>{m.settings_auth_role_modal_label_name()}</Label>
				<Input
					bind:value={formName}
					placeholder={m.settings_auth_role_modal_ph_dev()}
					class={formErrors.name ? 'border-destructive focus-visible:ring-destructive' : ''}
					oninput={() => formErrors.name = undefined}
				/>
				{#if formErrors.name}
					<p class="text-xs text-destructive">{formErrors.name}</p>
				{/if}
			</div>
			<div class="space-y-2">
				<Label>{m.settings_auth_role_modal_label_desc()}</Label>
				<Input
					bind:value={formDescription}
					placeholder={m.settings_auth_role_modal_ph_desc()}
				/>
			</div>
		</div>

		<!-- Vertically stacked permissions layout -->
		<div class="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
			<!-- System Permissions Section -->
			<div class="flex-shrink-0 border rounded-lg">
				<div class="px-4 py-3 border-b bg-muted/30">
					<div class="flex items-center gap-2">
						<Building2 class="w-4 h-4" />
						<span class="font-medium text-sm">{m.settings_auth_role_modal_sec_sys()}</span>
						<span class="text-xs text-muted-foreground">{m.settings_auth_role_modal_sec_sys_global()}</span>
					</div>
				</div>
				<div class="p-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
					{#each Object.entries(systemPermissions) as [category, permissions]}
						{@const IconComponent = categoryIcons[category]}
						<div class="relative border rounded-md pt-5 pb-3 px-3">
							<!-- Category pill on border -->
							<div class="absolute -top-2.5 left-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded border {categoryColorsSolid[category] || 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-400 border-gray-300 dark:border-gray-700'}">
								<IconComponent class="w-3.5 h-3.5" />
								<span class="text-xs font-medium capitalize">{categoryLabel(category)}</span>
							</div>
							<!-- Select all / Clear links -->
							<div class="absolute -top-2 right-3 flex gap-2 bg-background px-1">
								<button
									type="button"
									class="text-xs text-primary hover:underline"
									onclick={() => toggleAllPermissions(category as keyof typeof formPermissions, true, permissions)}
								>
									{m.common_all()}
								</button>
								<span class="text-muted-foreground">|</span>
								<button
									type="button"
									class="text-xs text-muted-foreground hover:underline"
									onclick={() => toggleAllPermissions(category as keyof typeof formPermissions, false, permissions)}
								>
									{m.containers_clear_selection()}
								</button>
							</div>
							<div class="flex flex-col gap-1.5">
								{#each permissions as permission}
									{@const PermIcon = permissionIcons[permission.key]}
									<label class="flex items-center gap-1.5 cursor-pointer">
										<Checkbox
											checked={formPermissions[category as keyof typeof formPermissions].includes(permission.key)}
											onCheckedChange={() => togglePermission(category as keyof typeof formPermissions, permission.key)}
										/>
										{#if PermIcon}
											<PermIcon class="w-3 h-3 text-muted-foreground" />
										{/if}
										<span class="text-xs truncate">{permission.label}</span>
									</label>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Environment Permissions Section -->
			<div class="flex-shrink-0 border rounded-lg">
				<div class="px-4 py-3 border-b bg-muted/30">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<Globe class="w-4 h-4" />
							<span class="font-medium text-sm">{m.settings_auth_role_modal_sec_env()}</span>
						</div>
						{#if environments.length > 0}
							<div class="flex items-center gap-2">
								<span class="text-xs text-muted-foreground">{m.settings_auth_role_modal_toggle_all_envs()}</span>
								<TogglePill bind:checked={formAllEnvironments} />
							</div>
						{/if}
					</div>
					<!-- Environment selector -->
					{#if environments.length > 0}
						{#if !formAllEnvironments}
							<div class="mt-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
								{#each environments as env}
									<label class="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-muted/50 transition-colors text-xs {formEnvironmentIds.includes(env.id) ? 'border-primary bg-primary/5' : ''}">
										<Checkbox
											checked={formEnvironmentIds.includes(env.id)}
											onCheckedChange={() => toggleEnvironment(env.id)}
										/>
										<EnvironmentIcon icon={env.icon || 'globe'} envId={env.id} class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
										<span class="truncate">{env.name}</span>
									</label>
								{/each}
							</div>
							{#if formEnvironmentIds.length === 0}
								<p class="text-xs text-amber-600 mt-2">{m.settings_auth_role_modal_warn_select_env()}</p>
							{/if}
						{:else}
							<p class="text-xs text-muted-foreground mt-1">{m.settings_auth_role_modal_info_all_future()}</p>
						{/if}
					{:else}
						<p class="text-xs text-muted-foreground mt-1">{m.settings_auth_role_modal_info_all()}</p>
					{/if}
				</div>
				<div class="p-3 grid grid-cols-2 lg:grid-cols-5 gap-3">
					{#each Object.entries(environmentPermissions) as [category, permissions]}
						{@const IconComponent = categoryIcons[category]}
						<div class="relative border rounded-md pt-5 pb-3 px-3">
							<!-- Category pill on border -->
							<div class="absolute -top-2.5 left-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded border {categoryColorsSolid[category] || 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-400 border-gray-300 dark:border-gray-700'}">
								<IconComponent class="w-3.5 h-3.5" />
								<span class="text-xs font-medium capitalize">{categoryLabel(category)}</span>
							</div>
							<!-- Select all / Clear links -->
							<div class="absolute -top-2 right-3 flex gap-2 bg-background px-1">
								<button
									type="button"
									class="text-xs text-primary hover:underline"
									onclick={() => toggleAllPermissions(category as keyof typeof formPermissions, true, permissions)}
								>
									{m.common_all()}
								</button>
								<span class="text-muted-foreground">|</span>
								<button
									type="button"
									class="text-xs text-muted-foreground hover:underline"
									onclick={() => toggleAllPermissions(category as keyof typeof formPermissions, false, permissions)}
								>
									{m.containers_clear_selection()}
								</button>
							</div>
							<div class="flex flex-col gap-1.5">
								{#each permissions as permission}
									{@const PermIcon = permissionIcons[permission.key]}
									<label class="flex items-center gap-1.5 cursor-pointer">
										<Checkbox
											checked={formPermissions[category as keyof typeof formPermissions].includes(permission.key)}
											onCheckedChange={() => togglePermission(category as keyof typeof formPermissions, permission.key)}
										/>
										{#if PermIcon}
											<PermIcon class="w-3 h-3 text-muted-foreground" />
										{/if}
										<span class="text-xs truncate">{permission.label}</span>
									</label>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<Dialog.Footer class="flex-shrink-0 pt-4">
			<Button variant="outline" onclick={handleClose}>{m.common_cancel()}</Button>
			<Button onclick={save} disabled={formSaving}>
				{#if formSaving}
					<RefreshCw class="w-4 h-4 mr-1 animate-spin" />
				{:else if isEditing}
					<Check class="w-4 h-4" />
				{:else}
					<Plus class="w-4 h-4" />
				{/if}
				{isEditing ? m.common_save() : m.settings_auth_role_modal_title_create()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
