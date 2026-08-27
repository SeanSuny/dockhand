<script lang="ts">
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import CronEditor from '$lib/components/cron-editor.svelte';
	import TimezoneSelector from '$lib/components/TimezoneSelector.svelte';
	import VulnerabilityCriteriaSelector, { type VulnerabilityCriteria } from '$lib/components/VulnerabilityCriteriaSelector.svelte';
	import { CircleFadingArrowUp, CircleArrowUp, RefreshCw, Info, Trash2 } from 'lucide-svelte';
	import { formatDateTime } from '$lib/stores/settings';
	import { formatBytes } from '$lib/utils/format';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		// Update check settings
		updateCheckLoading: boolean;
		updateCheckEnabled: boolean;
		updateCheckCron: string;
		updateCheckAutoUpdate: boolean;
		updateCheckVulnerabilityCriteria: VulnerabilityCriteria;
		scannerEnabled: boolean;
		// Image prune settings
		imagePruneLoading: boolean;
		imagePruneEnabled: boolean;
		imagePruneCron: string;
		imagePruneMode: 'dangling' | 'all';
		imagePruneLastPruned?: string;
		imagePruneLastResult?: { spaceReclaimed: number; imagesRemoved: number };
		// Timezone
		timezone: string;
	}

	let {
		updateCheckLoading,
		updateCheckEnabled = $bindable(),
		updateCheckCron = $bindable(),
		updateCheckAutoUpdate = $bindable(),
		updateCheckVulnerabilityCriteria = $bindable(),
		scannerEnabled,
		imagePruneLoading,
		imagePruneEnabled = $bindable(),
		imagePruneCron = $bindable(),
		imagePruneMode = $bindable(),
		imagePruneLastPruned,
		imagePruneLastResult,
		timezone = $bindable()
	}: Props = $props();

</script>

<!-- Scheduled Update Check Section -->
<div class="space-y-4">
	<div class="text-sm font-medium">
		{m.settings_env_updates_check_title()}
	</div>
	<p class="text-xs text-muted-foreground">
		{m.settings_env_updates_check_desc()}
	</p>

	{#if updateCheckLoading}
		<div class="flex items-center justify-center py-4">
			<RefreshCw class="w-5 h-5 animate-spin text-muted-foreground" />
		</div>
	{:else}
		<div class="flex items-start gap-2">
			<CircleFadingArrowUp class="w-4 h-4 text-green-500 glow-green mt-0.5 shrink-0" />
			<div class="flex-1">
				<Label>{m.settings_env_updates_check_enable()}</Label>
				<p class="text-xs text-muted-foreground">{m.settings_env_updates_check_enable_desc()}</p>
			</div>
			<TogglePill bind:checked={updateCheckEnabled} />
		</div>

		{#if updateCheckEnabled}
			<div class="flex items-start gap-2">
				<div class="w-4 shrink-0"></div>
				<div class="flex-1 space-y-2">
					<Label>{m.settings_env_updates_schedule()}</Label>
					<CronEditor value={updateCheckCron} onchange={(cron) => updateCheckCron = cron} />
				</div>
			</div>

			<div class="flex items-start gap-2">
				<CircleArrowUp class="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
				<div class="flex-1">
					<Label>{m.settings_env_updates_auto_update()}</Label>
					<p class="text-xs text-muted-foreground">
						{m.settings_env_updates_auto_update_desc()}
					</p>
				</div>
				<TogglePill bind:checked={updateCheckAutoUpdate} />
			</div>

			{#if updateCheckAutoUpdate && scannerEnabled}
				<div class="flex items-start gap-2">
					<div class="w-4 shrink-0"></div>
					<div class="flex-1">
						<Label>{m.settings_env_updates_block_vuln()}</Label>
						<p class="text-xs text-muted-foreground">
							{m.settings_env_updates_block_vuln_desc()}
						</p>
					</div>
					<VulnerabilityCriteriaSelector
						bind:value={updateCheckVulnerabilityCriteria}
						class="w-[200px]"
					/>
				</div>
			{/if}

			<div class="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 flex items-start gap-2">
				<Info class="w-3 h-3 mt-0.5 shrink-0" />
				{#if updateCheckAutoUpdate}
					{#if scannerEnabled && updateCheckVulnerabilityCriteria !== 'never'}
						<span>{m.settings_env_updates_info_scan()}</span>
					{:else}
						<span>{m.settings_env_updates_info_auto()}</span>
					{/if}
				{:else}
					<span>{m.settings_env_updates_info_notify()}</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<!-- Image Pruning Section -->
<div class="space-y-4 pt-4 border-t">
	<div class="text-sm font-medium">
		{m.settings_env_updates_prune_title()}
	</div>
	<p class="text-xs text-muted-foreground">
		{m.settings_env_updates_prune_desc()}
	</p>

	{#if imagePruneLoading}
		<div class="flex items-center justify-center py-4">
			<RefreshCw class="w-5 h-5 animate-spin text-muted-foreground" />
		</div>
	{:else}
		<div class="flex items-start gap-2">
			<Trash2 class="w-4 h-4 text-amber-500 glow-amber mt-0.5 shrink-0" />
			<div class="flex-1">
				<Label>{m.settings_env_updates_prune_enable()}</Label>
				<p class="text-xs text-muted-foreground">{m.settings_env_updates_prune_enable_desc()}</p>
			</div>
			<TogglePill bind:checked={imagePruneEnabled} />
		</div>

		{#if imagePruneEnabled}
			<div class="flex items-start gap-2">
				<div class="w-4 shrink-0"></div>
				<div class="flex-1 space-y-2">
					<Label>{m.settings_env_updates_schedule()}</Label>
					<CronEditor value={imagePruneCron} onchange={(cron) => imagePruneCron = cron} />
				</div>
			</div>

			<div class="flex items-start gap-2">
				<div class="w-4 shrink-0"></div>
				<div class="flex-1 space-y-2">
					<Label>{m.settings_env_updates_prune_mode()}</Label>
					<Select.Root type="single" bind:value={imagePruneMode}>
						<Select.Trigger class="w-full">
							{imagePruneMode === 'dangling' ? m.settings_env_updates_prune_dangling() : m.settings_env_updates_prune_all()}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="dangling">{m.settings_env_updates_prune_dangling()}</Select.Item>
							<Select.Item value="all">{m.settings_env_updates_prune_all()}</Select.Item>
						</Select.Content>
					</Select.Root>
					<p class="text-xs text-muted-foreground">
						{#if imagePruneMode === 'dangling'}
							{m.settings_env_updates_prune_dangling_desc()}
						{:else}
							{m.settings_env_updates_prune_all_desc()}
						{/if}
					</p>
				</div>
			</div>

			{#if imagePruneLastPruned}
				<div class="flex items-start gap-2">
					<div class="w-4 shrink-0"></div>
					<div class="flex-1">
						<p class="text-xs text-muted-foreground">
							{m.settings_env_updates_last_pruned({ time: formatDateTime(imagePruneLastPruned) })}
							{#if imagePruneLastResult}
								- {m.settings_env_updates_prune_result({ count: imagePruneLastResult.imagesRemoved, size: formatBytes(imagePruneLastResult.spaceReclaimed) })}
							{/if}
						</p>
					</div>
				</div>
			{/if}

			<div class="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 flex items-start gap-2">
				<Info class="w-3 h-3 mt-0.5 shrink-0" />
				<span>{m.settings_env_updates_prune_info()}</span>
			</div>
		{/if}
	{/if}
</div>

<!-- Timezone selector -->
<div class="space-y-2">
	<Label>{m.settings_env_updates_timezone()}</Label>
	<TimezoneSelector
		bind:value={timezone}
		id="edit-env-timezone"
	/>
	<p class="text-xs text-muted-foreground">
		{m.settings_env_updates_timezone_desc()}
	</p>
</div>
