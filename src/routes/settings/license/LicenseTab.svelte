<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Input } from '$lib/components/ui/input';
	import { Crown, Building2, Key, RefreshCw, ShieldCheck, XCircle } from 'lucide-svelte';
	import { canAccess } from '$lib/stores/auth';
	import { licenseStore } from '$lib/stores/license';
	import { formatDate } from '$lib/stores/settings';

	// License state
	interface LicenseInfo {
		valid: boolean;
		active: boolean;
		hostname?: string;
		payload?: {
			name: string;
			host: string;
			issued: string;
			expires: string | null;
			type: string;
		};
		stored?: {
			name: string;
			key: string;
			activated_at: string;
		};
		error?: string;
	}

	let licenseInfo = $state<LicenseInfo | null>(null);
	let licenseLoading = $state(true);
	let licenseFormName = $state('');
	let licenseFormKey = $state('');
	let licenseFormError = $state('');
	let licenseFormSaving = $state(false);

	async function fetchLicenseInfo() {
		licenseLoading = true;
		try {
			const response = await fetch('/api/license');
			licenseInfo = await response.json();
		} catch (error) {
			console.error('Failed to fetch license info:', error);
			licenseInfo = { valid: false, active: false, error: m.settings_license_fetch_failed() };
		} finally {
			licenseLoading = false;
		}
	}

	async function activateLicense() {
		if (!licenseFormName.trim() || !licenseFormKey.trim()) {
			licenseFormError = m.settings_license_err_required();
			return;
		}

		licenseFormSaving = true;
		licenseFormError = '';

		try {
			const response = await fetch('/api/license', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: licenseFormName.trim(),
					key: licenseFormKey.trim()
				})
			});

			const result = await response.json();

			if (!response.ok || result.error) {
				licenseFormError = result.error || m.settings_license_activate_failed();
				return;
			}

			// Refresh license info and update global store
			await fetchLicenseInfo();
			await licenseStore.check();
			toast.success(m.settings_license_activated_success());

			// Clear form
			licenseFormName = '';
			licenseFormKey = '';
		} catch (error) {
			licenseFormError = m.settings_license_activate_failed();
			toast.error(m.settings_license_activate_failed());
		} finally {
			licenseFormSaving = false;
		}
	}

	async function deactivateLicense() {
		try {
			await fetch('/api/license', { method: 'DELETE' });
			await fetchLicenseInfo();
			await licenseStore.check();
			toast.success(m.settings_license_deactivated());
		} catch (error) {
			console.error('Failed to deactivate license:', error);
			toast.error(m.settings_license_deactivate_failed());
		}
	}

	onMount(() => {
		fetchLicenseInfo();
	});
</script>

<div class="space-y-4">
	<Card.Root class="border-dashed">
		<Card.Content class="pt-4">
			<div class="flex items-start gap-3">
				<Crown class="w-5 h-5 text-amber-500 mt-0.5" />
				<div>
					<p class="text-sm font-medium">{m.settings_license_title()}</p>
					<p class="text-xs text-muted-foreground">
						{m.settings_license_intro_1()}<span class="font-medium">{m.command_palette_group_enterprise()}</span>{m.settings_license_intro_2()}
					</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	{#if licenseLoading}
		<Card.Root>
			<Card.Content class="py-8 text-center">
				<RefreshCw class="w-6 h-6 mx-auto mb-2 animate-spin text-muted-foreground" />
				<p class="text-sm text-muted-foreground">{m.settings_license_loading()}</p>
			</Card.Content>
		</Card.Root>
	{:else if licenseInfo?.valid && licenseInfo?.active}
		<!-- Active License Display -->
		{@const isEnterprise = licenseInfo.payload?.type === 'enterprise'}
		<Card.Root class={isEnterprise ? 'border-amber-500/50 bg-amber-500/5' : 'border-blue-500/50 bg-blue-500/5'}>
			<Card.Header>
				<Card.Title class="text-sm font-medium flex items-center gap-2">
					{#if isEnterprise}
						<Crown class="w-4 h-4 text-amber-500" />
						{m.settings_license_active_ent()}
					{:else}
						<Building2 class="w-4 h-4 text-blue-500" />
						{m.settings_license_active_smb()}
					{/if}
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="grid grid-cols-2 gap-4 text-sm">
					<div>
						<p class="text-muted-foreground">{m.settings_about_licensed_to()}</p>
						<p class="font-medium">{licenseInfo.payload?.name}</p>
					</div>
					<div>
						<p class="text-muted-foreground">{m.settings_license_type()}</p>
						<p class="font-medium flex items-center gap-1">
							{#if isEnterprise}
								<Crown class="w-3.5 h-3.5 text-amber-500" />
								<span class="text-amber-600 dark:text-amber-400">{m.command_palette_group_enterprise()}</span>
							{:else}
								<Building2 class="w-3.5 h-3.5 text-blue-500" />
								<span class="text-blue-600 dark:text-blue-400">{m.settings_about_license_smb()}</span>
							{/if}
						</p>
					</div>
					<div>
						<p class="text-muted-foreground">{m.settings_license_host()}</p>
						<p class="font-medium font-mono text-xs">{licenseInfo.payload?.host}</p>
					</div>
					<div>
						<p class="text-muted-foreground">{m.settings_license_issued()}</p>
						<p class="font-medium">{formatDate(licenseInfo.payload?.issued || '')}</p>
					</div>
					<div>
						<p class="text-muted-foreground">{m.settings_license_expires()}</p>
						<p class="font-medium">{licenseInfo.payload?.expires ? formatDate(licenseInfo.payload.expires) : m.settings_license_perpetual()}</p>
					</div>
				</div>
				<div class="pt-2 border-t">
					<p class="text-xs text-muted-foreground mb-2">{m.settings_license_current_hostname()}</p>
					<code class="text-xs bg-muted px-2 py-1 rounded">{licenseInfo.hostname}</code>
				</div>
				{#if $canAccess('settings', 'edit')}
				<div class="flex justify-end">
					<Button variant="outline" size="sm" onclick={deactivateLicense}>
						<XCircle class="w-4 h-4" />
						{m.settings_license_deactivate()}
					</Button>
				</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<!-- License Activation Form -->
		<Card.Root>
			<Card.Header>
				<Card.Title class="text-sm font-medium flex items-center gap-2">
					<Key class="w-4 h-4" />
					{m.settings_auth_roles_activate_license()}
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				{#if licenseFormError}
					<div class="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 rounded p-2">
						{licenseFormError}
					</div>
				{/if}

				{#if licenseInfo?.error && !licenseFormError}
					<div class="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 rounded p-2">
						{licenseInfo.error}
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="license-name">{m.settings_license_name_label()}</Label>
					<Input
						id="license-name"
						bind:value={licenseFormName}
						placeholder={m.settings_license_name_placeholder()}
						disabled={!$canAccess('settings', 'edit')}
					/>
					<p class="text-xs text-muted-foreground">{m.settings_license_name_hint()}</p>
				</div>

				<div class="space-y-2">
					<Label for="license-key">{m.settings_license_key_label()}</Label>
					<textarea
						id="license-key"
						bind:value={licenseFormKey}
						placeholder={m.settings_license_key_placeholder()}
						class="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
						disabled={!$canAccess('settings', 'edit')}
					></textarea>
				</div>

				<div class="pt-2 border-t">
					<p class="text-xs text-muted-foreground mb-2">{m.settings_license_hostname_hint()}</p>
					<code class="text-xs bg-muted px-2 py-1 rounded">{licenseInfo?.hostname || m.container_inspect_unknown()}</code>
				</div>

				{#if $canAccess('settings', 'edit')}
				<div class="flex justify-end">
					<Button onclick={activateLicense} disabled={licenseFormSaving}>
						{#if licenseFormSaving}
							<RefreshCw class="w-4 h-4 mr-1 animate-spin" />
						{:else}
							<ShieldCheck class="w-4 h-4" />
						{/if}
						{m.settings_auth_roles_activate_license()}
					</Button>
				</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>
