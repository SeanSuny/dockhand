<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Plus, Check, RefreshCw, Mail, Zap, Info, Send, CheckCircle2, XCircle, Key, ChevronDown, HelpCircle } from 'lucide-svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import { focusFirstInput } from '$lib/utils';

	// System-only events (configured at channel level, not per-environment)
	const SYSTEM_EVENTS = [
		{ id: 'license_expiring', label: m.settings_notif_modal_sys_license_label(), description: m.settings_notif_modal_sys_license_desc() }
	] as const;

	export interface NotificationSetting {
		id: number;
		name: string;
		type: 'smtp' | 'apprise';
		enabled: boolean;
		config: Record<string, any>;
		eventTypes: string[];
		createdAt: string;
	}

	interface Props {
		open: boolean;
		notification?: NotificationSetting | null;
		onClose: () => void;
		onSaved: () => void;
	}

	let { open = $bindable(), notification = null, onClose, onSaved }: Props = $props();

	const isEditing = $derived(notification !== null);

	// Form state
	let formType = $state<'smtp' | 'apprise'>('smtp');
	let formName = $state('');
	let formEnabled = $state(true);
	// SMTP specific
	let formSmtpHost = $state('');
	let formSmtpPort = $state(587);
	let formSmtpSecure = $state(false);
	let formSmtpSkipTlsVerify = $state(false);
	let formSmtpUsername = $state('');
	let formSmtpPassword = $state('');
	let formSmtpFromEmail = $state('');
	let formSmtpFromName = $state('');
	let formSmtpToEmails = $state('');
	// Apprise specific
	let formAppriseUrls = $state('');
	// System events
	let formSystemEvents = $state<string[]>([]);
	let showSystemEvents = $state(false);
	let formError = $state('');
	let formSaving = $state(false);
	let formTesting = $state(false);
	let testResult = $state<'idle' | 'success' | 'error'>('idle');
	let initializedForId = $state<number | null>(null);

	function resetForm() {
		formType = 'smtp';
		formName = '';
		formEnabled = true;
		formSmtpHost = '';
		formSmtpPort = 587;
		formSmtpSecure = false;
		formSmtpSkipTlsVerify = false;
		formSmtpUsername = '';
		formSmtpPassword = '';
		formSmtpFromEmail = '';
		formSmtpFromName = '';
		formSmtpToEmails = '';
		formAppriseUrls = '';
		formSystemEvents = [];
		showSystemEvents = false;
		formError = '';
		formSaving = false;
		formTesting = false;
		testResult = 'idle';
	}

	// Initialize form when notification changes or modal opens
	$effect(() => {
		if (open) {
			if (notification) {
				// Only initialize if this is a different notification than before
				if (initializedForId === notification.id) return;
				initializedForId = notification.id;

				formType = notification.type;
				formName = notification.name;
				formEnabled = notification.enabled;

				if (notification.type === 'smtp') {
					formSmtpHost = notification.config.host || '';
					formSmtpPort = notification.config.port || 587;
					formSmtpSecure = notification.config.secure || false;
					formSmtpSkipTlsVerify = notification.config.skipTlsVerify || false;
					formSmtpUsername = notification.config.username || '';
					formSmtpPassword = '';
					formSmtpFromEmail = notification.config.from_email || '';
					formSmtpFromName = notification.config.from_name || '';
					formSmtpToEmails = notification.config.to_emails?.join(', ') || '';
				} else {
					formAppriseUrls = notification.config.urls?.join('\n') || '';
				}

				// Load system events (filter to only system-scoped events)
				const systemEventIds = SYSTEM_EVENTS.map(e => e.id);
				formSystemEvents = (notification.eventTypes || []).filter(e => systemEventIds.includes(e as typeof SYSTEM_EVENTS[number]['id']));
				showSystemEvents = formSystemEvents.length > 0;

				formError = '';
				formSaving = false;
			} else {
				// New notification - only reset if we haven't already
				if (initializedForId !== -1) {
					initializedForId = -1; // Use -1 to mark "new notification" mode
					resetForm();
				}
			}
		} else {
			// Modal closed - reset the guard so next open will initialize
			initializedForId = null;
		}
	});

	function getFormConfig() {
		if (formType === 'smtp') {
			return {
				host: formSmtpHost.trim(),
				port: formSmtpPort,
				secure: formSmtpSecure,
				skipTlsVerify: formSmtpSkipTlsVerify || undefined,
				username: formSmtpUsername.trim() || undefined,
				password: formSmtpPassword || undefined,
				from_email: formSmtpFromEmail.trim(),
				from_name: formSmtpFromName.trim() || undefined,
				to_emails: formSmtpToEmails.split(',').map(e => e.trim()).filter(Boolean)
			};
		} else {
			return {
				urls: formAppriseUrls.split('\n').map(u => u.trim()).filter(Boolean)
			};
		}
	}

	function validateConfig(): string | null {
		const config = getFormConfig();
		if (formType === 'smtp') {
			if (!config.host || !config.from_email || !config.to_emails?.length) {
				return m.settings_notif_modal_err_smtp_required();
			}
		} else {
			if (!config.urls?.length) {
				return m.settings_notif_modal_err_url_required();
			}
		}
		return null;
	}

	async function testConfig() {
		const validationError = validateConfig();
		if (validationError) {
			formError = validationError;
			return;
		}

		formTesting = true;
		formError = '';
		testResult = 'idle';

		try {
			// When editing with no password entered, use stored credentials via [id]/test
			// to avoid sending blank password and getting "Missing credentials" from SMTP server
			const useStoredCredentials = isEditing && formType === 'smtp' && !formSmtpPassword && notification?.id;

			let response: Response;
			if (useStoredCredentials) {
				response = await fetch(`/api/notifications/${notification!.id}/test`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' }
				});
			} else {
				const config = getFormConfig();
				response = await fetch('/api/notifications/test', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						type: formType,
						name: formName.trim() || 'Test',
						config
					})
				});
			}

			const data = await response.json();

			if (data.success) {
				testResult = 'success';
				toast.success(m.settings_notif_test_sent());
				setTimeout(() => { testResult = 'idle'; }, 3000);
			} else {
				testResult = 'error';
				formError = data.error || m.settings_notif_send_test_failed();
				setTimeout(() => { testResult = 'idle'; }, 3000);
			}
		} catch {
			testResult = 'error';
			formError = m.settings_notif_test_action_failed();
			setTimeout(() => { testResult = 'idle'; }, 3000);
		} finally {
			formTesting = false;
		}
	}

	async function save() {
		if (!formName.trim()) {
			formError = m.settings_env_modal_err_name_required();
			return;
		}

		const config = getFormConfig();
		if (formType === 'smtp') {
			if (!config.host || !config.from_email || !config.to_emails?.length) {
				formError = m.settings_notif_modal_err_smtp_required();
				return;
			}
		} else {
			if (!config.urls?.length) {
				formError = m.settings_notif_modal_err_url_required();
				return;
			}
		}

		formSaving = true;
		formError = '';

		try {
			const url = isEditing ? `/api/notifications/${notification!.id}` : '/api/notifications';
			const method = isEditing ? 'PUT' : 'POST';

			const body: Record<string, any> = {
				name: formName.trim(),
				enabled: formEnabled,
				config,
				eventTypes: formSystemEvents
			};

			// Only include type for new notifications
			if (!isEditing) {
				body.type = formType;
			}

			const response = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (response.ok) {
				open = false;
				onSaved();
			} else {
				const data = await response.json();
				formError = data.error || (isEditing ? m.settings_notif_modal_err_save_update() : m.settings_notif_modal_err_save_create());
			}
		} catch {
			formError = (isEditing ? m.settings_notif_modal_err_save_update() : m.settings_notif_modal_err_save_create());
		} finally {
			formSaving = false;
		}
	}

	function handleClose() {
		open = false;
		onClose();
	}

	function toggleSystemEvent(eventId: string, checked: boolean) {
		if (checked) {
			formSystemEvents = [...formSystemEvents, eventId];
		} else {
			formSystemEvents = formSystemEvents.filter(e => e !== eventId);
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={(o) => { if (o) { formError = ''; focusFirstInput(); } }}>
	<Dialog.Content class="max-w-3xl max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{isEditing ? m.settings_notif_modal_title_edit() : m.settings_notif_modal_title_add()}</Dialog.Title>
		</Dialog.Header>
		<div class="space-y-4">
			{#if formError}
				<div class="text-sm text-red-600 dark:text-red-400">{formError}</div>
			{/if}

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="notif-name">{m.settings_cfgset_modal_name_label()}</Label>
					<Input id="notif-name" bind:value={formName} placeholder={m.settings_notif_modal_name_ph()} />
				</div>
				<div class="space-y-2">
					<Label>{m.volumes_col_type()}</Label>
					{#if isEditing}
						<Badge variant="secondary" class="h-9 flex items-center justify-center">
							{formType === 'smtp' ? m.settings_notif_modal_type_smtp() : m.settings_notif_modal_type_webhook()}
						</Badge>
					{:else}
						<Select.Root
							type="single"
							value={formType}
							onValueChange={(v) => formType = v as 'smtp' | 'apprise'}
						>
							<Select.Trigger class="w-full">
								<span class="flex items-center gap-2">
									{#if formType === 'smtp'}
										<Mail class="w-4 h-4" />{m.settings_notif_modal_type_smtp()}
									{:else}
										<Zap class="w-4 h-4" />{m.settings_notif_modal_type_webhook()}
									{/if}
								</span>
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="smtp">
									<span class="flex items-center gap-2"><Mail class="w-4 h-4" />{m.settings_notif_modal_type_smtp()}</span>
								</Select.Item>
								<Select.Item value="apprise">
									<span class="flex items-center gap-2"><Zap class="w-4 h-4" />{m.settings_notif_modal_type_webhook()}</span>
								</Select.Item>
							</Select.Content>
						</Select.Root>
					{/if}
				</div>
			</div>

			<div class="flex items-center gap-2">
				<Label>{m.common_status()}</Label>
				<TogglePill bind:checked={formEnabled} onLabel={m.toast_setting_enabled()} offLabel={m.toast_setting_disabled()} />
			</div>

			{#if formType === 'smtp'}
				<div class="space-y-4 border-t pt-4 min-h-[380px]">
					<div class="flex items-center gap-2">
						<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{m.settings_notif_modal_smtp_section()}</p>
						<Tooltip.Root>
							<Tooltip.Trigger>
								<HelpCircle class="w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help" />
							</Tooltip.Trigger>
							<Tooltip.Portal>
								<Tooltip.Content side="right" class="w-80">
									<p class="text-xs"><span class="font-semibold">Gmail:</span> {m.settings_notif_modal_smtp_tip_gmail()}</p>
									<p class="text-xs mt-1"><span class="font-semibold">Outlook:</span> {m.settings_notif_modal_smtp_tip_outlook()}</p>
								</Tooltip.Content>
							</Tooltip.Portal>
						</Tooltip.Root>
					</div>
					<div class="grid grid-cols-3 gap-4">
						<div class="space-y-2 col-span-2">
							<Label for="notif-smtp-host">{m.settings_notif_modal_smtp_host_label()}</Label>
							<Input id="notif-smtp-host" bind:value={formSmtpHost} placeholder="smtp.gmail.com" />
						</div>
						<div class="space-y-2">
							<Label for="notif-smtp-port">{m.settings_notif_modal_port_label()}</Label>
							<Input id="notif-smtp-port" type="number" bind:value={formSmtpPort} />
						</div>
					</div>
					<div class="flex items-center gap-4">
						<div class="flex items-center gap-2">
							<Label>TLS/SSL</Label>
							<TogglePill bind:checked={formSmtpSecure} onLabel={m.container_inspect_yes()} offLabel={m.container_inspect_no()} />
						</div>
						<div class="flex items-center gap-2">
							<Label class="text-muted-foreground">{m.settings_notif_modal_smtp_skip_tls()}</Label>
							<TogglePill bind:checked={formSmtpSkipTlsVerify} onLabel={m.container_inspect_yes()} offLabel={m.container_inspect_no()} />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<Label for="notif-smtp-username">{m.login_username()}</Label>
							<Input id="notif-smtp-username" bind:value={formSmtpUsername} placeholder="user@example.com" />
						</div>
						<div class="space-y-2">
							<Label for="notif-smtp-password">{m.login_password()}</Label>
							<Input id="notif-smtp-password" type="password" bind:value={formSmtpPassword} placeholder={isEditing ? m.settings_notif_modal_smtp_pw_keep() : m.settings_notif_modal_smtp_pw_ph()} />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-2">
							<Label for="notif-smtp-from-email">{m.settings_notif_modal_smtp_from_email_label()}</Label>
							<Input id="notif-smtp-from-email" bind:value={formSmtpFromEmail} placeholder="alerts@example.com" />
						</div>
						<div class="space-y-2">
							<Label for="notif-smtp-from-name">{m.settings_notif_modal_smtp_from_name()}</Label>
							<Input id="notif-smtp-from-name" bind:value={formSmtpFromName} placeholder="Dockhand Alerts" />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="notif-smtp-to">{m.settings_notif_modal_smtp_to_label()}</Label>
						<Input id="notif-smtp-to" bind:value={formSmtpToEmails} placeholder="admin@example.com, ops@example.com" />
					</div>
				</div>
			{:else}
				<div class="space-y-4 border-t pt-4 min-h-[380px]">
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{m.settings_notif_modal_webhook_section()}</p>
					<div class="space-y-2">
						<Label for="notif-apprise-urls">{m.settings_notif_modal_urls_label()}</Label>
						<textarea
							id="notif-apprise-urls"
							bind:value={formAppriseUrls}
							placeholder="gotify://hostname/app-token
gotifys://hostname/app-token?priority=5
discord://webhook_id/webhook_token
slack://token_a/token_b/token_c
mmost://hostname/webhook-token
tgram://bot_token/chat_id
tgram://bot_token/chat_id:topic_id
ntfy://my-topic
ntfy://host/topic?auth=base64token&priority=3
ntfys://host/topic?auth=base64token
pushover://user_key/api_token
workflows://hostname/workflow/signature
bark://bark_key
bark://host/bark_key
barks://host/bark_key
signal://host:8080/+sender/+recipient
apprise://host:8000/your-key
jsons://hostname/webhook/path"
						class="flex min-h-[220px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					></textarea>
					<p class="text-xs text-muted-foreground">
						{m.settings_notif_modal_urls_support()} {m.settings_notif_modal_urls_or_use()} <code>apprise://</code> {m.settings_notif_modal_urls_forward_to()} <a href="https://github.com/caronc/apprise-api" target="_blank" rel="noopener">caronc/apprise-api</a> {m.settings_notif_modal_urls_server_tail()}
						</p>
					</div>
				</div>
			{/if}

			<!-- System events configuration -->
			<div class="border-t pt-4">
				<button
					type="button"
					class="w-full flex items-center justify-between text-left"
					onclick={() => showSystemEvents = !showSystemEvents}
				>
					<div class="flex items-center gap-2">
						<Key class="w-4 h-4 text-muted-foreground" />
						<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{m.settings_notif_modal_sys_events_section()}</span>
					</div>
					<ChevronDown class="w-4 h-4 text-muted-foreground transition-transform {showSystemEvents ? 'rotate-180' : ''}" />
				</button>
				{#if showSystemEvents}
					<div class="mt-3 space-y-2">
						<p class="text-xs text-muted-foreground mb-3">
							{m.settings_notif_modal_sys_events_desc()}
						</p>
						{#each SYSTEM_EVENTS as event}
							<label class="flex items-start gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer">
								<Checkbox
									checked={formSystemEvents.includes(event.id)}
									onCheckedChange={(checked) => toggleSystemEvent(event.id, !!checked)}
								/>
								<div class="flex-1 min-w-0">
									<span class="text-sm font-medium">{event.label}</span>
									<p class="text-xs text-muted-foreground">{event.description}</p>
								</div>
							</label>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Info about per-env config -->
			<div class="border-t pt-4">
				<div class="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 flex items-start gap-2">
					<Info class="w-4 h-4 mt-0.5 shrink-0" />
					<span>{m.settings_notif_modal_env_events_hint()}</span>
				</div>
			</div>
		</div>
		<Dialog.Footer class="flex justify-between sm:justify-between">
			<Button variant="outline" onclick={testConfig} disabled={formTesting || formSaving}>
				{#if formTesting}
					<RefreshCw class="w-4 h-4 mr-1 animate-spin" />
					{m.settings_env_status_testing()}
				{:else if testResult === 'success'}
					<CheckCircle2 class="w-4 h-4 mr-1 text-green-500" />
					{m.settings_notif_modal_test_sent_btn()}
				{:else if testResult === 'error'}
					<XCircle class="w-4 h-4 mr-1 text-destructive" />
					{m.common_failed()}
				{:else}
					<Send class="w-4 h-4" />
					{m.settings_registry_modal_test()}
				{/if}
			</Button>
			<div class="flex gap-2">
				<Button variant="outline" onclick={handleClose}>{m.common_cancel()}</Button>
				<Button onclick={save} disabled={formSaving || formTesting}>
					{#if formSaving}
						<RefreshCw class="w-4 h-4 mr-1 animate-spin" />
					{:else if isEditing}
						<Check class="w-4 h-4" />
					{:else}
						<Plus class="w-4 h-4" />
					{/if}
					{isEditing ? m.common_save() : m.common_add()}
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
