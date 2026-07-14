<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { Loader2 } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		stackName: string;
		envId: number | null;
		disabled?: boolean;
		side?: 'top' | 'bottom';
		align?: 'start' | 'center' | 'end';
		onDeploy: (options: { pull: boolean; build: boolean; forceRecreate: boolean }) => Promise<void>;
		children: Snippet;
	}

	let {
		stackName,
		envId,
		disabled = false,
		side = 'top',
		align = 'end',
		onDeploy,
		children
	}: Props = $props();

	let open = $state(false);
	let pull = $state(true);
	let build = $state(false);
	let forceRecreate = $state(false);
	let deploying = $state(false);

	async function handleDeploy() {
		deploying = true;
		try {
			await onDeploy({ pull, build, forceRecreate });
		} finally {
			deploying = false;
			open = false;
		}
	}

	function handleTriggerClick(e: MouseEvent) {
		e.stopPropagation();
		if (disabled) return;
		open = !open;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger asChild>
		{#snippet child({ props })}
			<button
				type="button"
				title={m.stacks_redeploy_title()}
				{...props}
				onclick={handleTriggerClick}
				class="p-1 rounded hover:bg-muted transition-colors opacity-70 hover:opacity-100 cursor-pointer inline-flex items-center"
			>
				{@render children()}
			</button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		class="w-56 p-3 z-[200]"
		{side}
		{align}
		sideOffset={8}
	>
		<div class="space-y-3">
			<p class="text-xs font-medium">{m.stacks_redeploy_title()}</p>
			<div class="space-y-2">
				<label class="flex items-center gap-2 cursor-pointer">
					<Checkbox bind:checked={pull} disabled={deploying} />
					<span class="text-xs">{m.stacks_redeploy_pull_images()}</span>
				</label>
				<label class="flex items-center gap-2 cursor-pointer">
					<Checkbox bind:checked={build} disabled={deploying} />
					<span class="text-xs">{m.stacks_redeploy_build_images()}</span>
				</label>
				<label class="flex items-center gap-2 cursor-pointer">
					<Checkbox bind:checked={forceRecreate} disabled={deploying} />
					<span class="text-xs">{m.stacks_redeploy_force_recreate()}</span>
				</label>
			</div>
			<Button
				size="sm"
				class="w-full h-7 text-xs"
				onclick={handleDeploy}
				disabled={deploying}
			>
				{#if deploying}
					<Loader2 class="w-3 h-3 mr-1 animate-spin" />
					{m.stacks_redeploy_deploying()}
				{:else}
					{m.common_deploy()}
				{/if}
			</Button>
		</div>
	</Popover.Content>
</Popover.Root>
