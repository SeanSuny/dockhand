<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { HardDrive, Lock, Container } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import FileBrowserPanel from '../containers/FileBrowserPanel.svelte';
	import * as m from '$lib/paraglide/messages';

	interface VolumeUsageInfo {
		containerId: string;
		containerName: string;
		state: string;
	}

	interface Props {
		open: boolean;
		volumeName: string;
		envId?: number | null;
		onclose: () => void;
	}

	let { open = $bindable(), volumeName, envId, onclose }: Props = $props();

	// Track volume usage from FileBrowserPanel
	let volumeUsage = $state<VolumeUsageInfo[]>([]);
	let isInUse = $state(false);

	function handleUsageChange(usage: VolumeUsageInfo[], inUse: boolean) {
		volumeUsage = usage;
		isInUse = inUse;
	}

	async function releaseHelperContainer() {
		try {
			const params = new URLSearchParams();
			if (envId) params.set('env', String(envId));
			await fetch(`/api/volumes/${encodeURIComponent(volumeName)}/browse/release?${params}`, {
				method: 'POST'
			});
		} catch {
			// Silently ignore - cleanup is best-effort
		}
	}

	function handleOpenChange(isOpen: boolean) {
		if (!isOpen) {
			// Release the helper container when modal closes
			releaseHelperContainer();
			onclose();
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class="max-w-4xl h-[90vh] sm:h-[80vh] flex flex-col">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2">
				<HardDrive class="w-5 h-5" />
				<span>{m.volumes_browse_title({ name: volumeName })}</span>
				{#if isInUse}
					<Badge variant="secondary" class="flex items-center gap-1 ml-2">
						<Lock class="w-3 h-3" />
						<span>{m.container_inspect_read_only()}</span>
					</Badge>
				{/if}
			</Dialog.Title>
			<Dialog.Description>
				{#if isInUse}
					<span class="flex items-center gap-1.5 flex-wrap">
						<Lock class="w-3.5 h-3.5 text-muted-foreground inline" />
						<span>{m.volumes_browse_in_use_by()}</span>
						{#each volumeUsage as container, i}
							<span class="inline-flex items-center gap-1 text-foreground font-medium">
								<Container class="w-3 h-3" />
								{container.containerName}
								<span class="text-muted-foreground">({container.state})</span>{#if i < volumeUsage.length - 1}<span>,</span>{/if}
							</span>
						{/each}
						<span class="text-muted-foreground">{m.volumes_browse_editing_disabled()}</span>
					</span>
				{:else}
					{m.volumes_browse_description()}
				{/if}
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex-1 overflow-hidden border rounded-lg">
			<FileBrowserPanel
				{volumeName}
				envId={envId ?? undefined}
				canEdit={true}
				onUsageChange={handleUsageChange}
			/>
		</div>
	</Dialog.Content>
</Dialog.Root>
