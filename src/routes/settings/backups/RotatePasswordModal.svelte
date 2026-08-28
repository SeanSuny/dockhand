<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as m from '$lib/paraglide/messages';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { KeyRound, Loader2, AlertTriangle } from 'lucide-svelte';

	interface Props {
		open: boolean;
		destinationId: number;
		destinationName: string;
	}

	let { open = $bindable(), destinationId, destinationName }: Props = $props();

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let submitting = $state(false);
	let dbOutOfSync = $state(false);
	let errorMsg = $state<string | null>(null);

	// Reset when the dialog opens for a new destination
	$effect(() => {
		if (open) {
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
			dbOutOfSync = false;
			errorMsg = null;
		}
	});

	const passwordsMatch = $derived(newPassword.length > 0 && newPassword === confirmPassword);
	const canSubmit = $derived(
		!submitting &&
		currentPassword.length > 0 &&
		newPassword.length > 0 &&
		passwordsMatch &&
		newPassword !== currentPassword
	);

	async function submit() {
		errorMsg = null;
		dbOutOfSync = false;
		submitting = true;
		try {
			const res = await fetch(`/api/backup/destinations/${destinationId}/rotate-key`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword, newPassword })
			});
			const data = await res.json().catch(() => ({}));
			if (res.ok && data.success) {
				toast.success(`Password rotated for "${destinationName}"`);
				open = false;
				return;
			}
			if (data.dbOutOfSync) {
				dbOutOfSync = true;
				errorMsg = data.error || 'Repository was rotated but Dockhand could not save the new password.';
				return;
			}
			errorMsg = data.error || `Rotation failed (HTTP ${res.status})`;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<KeyRound class="w-4 h-4" />
				{m.backups_rotate_password_title()}
			</Dialog.Title>
			<Dialog.Description>
				{m.backups_rotate_password_desc({ name: destinationName })}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-3 py-2">
			<div class="space-y-1">
				<Label for="rotate-current">{m.backups_rotate_current_password()}</Label>
				<Input id="rotate-current" type="password" bind:value={currentPassword} autocomplete="current-password" />
			</div>
			<div class="space-y-1">
				<Label for="rotate-new">{m.settings_auth_user_modal_new_password()}</Label>
				<Input id="rotate-new" type="password" bind:value={newPassword} autocomplete="new-password" />
			</div>
			<div class="space-y-1">
				<Label for="rotate-confirm">{m.backups_rotate_confirm_password()}</Label>
				<Input id="rotate-confirm" type="password" bind:value={confirmPassword} autocomplete="new-password" />
				{#if confirmPassword.length > 0 && !passwordsMatch}
					<p class="text-xs text-destructive">{m.settings_auth_user_modal_err_passwords_mismatch()}</p>
				{/if}
				{#if newPassword.length > 0 && newPassword === currentPassword}
					<p class="text-xs text-destructive">{m.backups_rotate_passwords_same()}</p>
				{/if}
			</div>

			{#if errorMsg}
				<div class="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
					<div class="flex items-start gap-2">
						<AlertTriangle class="w-4 h-4 mt-0.5 text-destructive shrink-0" />
						<div>
							<p class="font-medium text-destructive">
								{#if dbOutOfSync}
									{m.backups_rotate_db_failed()}
								{:else}
									{m.backups_rotate_failed()}
								{/if}
							</p>
							<p class="text-muted-foreground mt-1 break-words">{errorMsg}</p>
							{#if dbOutOfSync}
								<p class="text-muted-foreground mt-2">
									{m.backups_rotate_manual_hint()}
								</p>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={submitting}>{m.common_cancel()}</Button>
			<Button onclick={submit} disabled={!canSubmit}>
				{#if submitting}
					<Loader2 class="w-3 h-3 mr-2 animate-spin" />
					{m.backups_rotate_in_progress()}
				{:else}
					{m.backups_rotate_password_button()}
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
