<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { TogglePill } from '$lib/components/ui/toggle-pill';
	import * as Select from '$lib/components/ui/select';
	import { Percent, HardDrive } from 'lucide-svelte';
	import * as m from '$lib/paraglide/messages';

	interface Props {
		collectActivity: boolean;
		collectMetrics: boolean;
		highlightChanges: boolean;
		diskWarningEnabled: boolean;
		diskWarningMode: 'percentage' | 'absolute';
		diskWarningThreshold: number;
		diskWarningThresholdGb: number;
	}

	let {
		collectActivity = $bindable(),
		collectMetrics = $bindable(),
		highlightChanges = $bindable(),
		diskWarningEnabled = $bindable(),
		diskWarningMode = $bindable(),
		diskWarningThreshold = $bindable(),
		diskWarningThresholdGb = $bindable()
	}: Props = $props();
</script>

<div class="flex items-start gap-3">
	<div class="flex-1">
		<Label>{m.settings_env_activity_collect()}</Label>
		<p class="text-xs text-muted-foreground">{m.settings_env_activity_collect_desc()}</p>
	</div>
	<TogglePill bind:checked={collectActivity} />
</div>
<div class="flex items-start gap-3">
	<div class="flex-1">
		<Label>{m.settings_env_activity_metrics()}</Label>
		<p class="text-xs text-muted-foreground">{m.settings_env_activity_metrics_desc()}</p>
	</div>
	<TogglePill bind:checked={collectMetrics} />
</div>
<div class="flex items-start gap-3">
	<div class="flex-1">
		<Label>{m.settings_env_activity_highlight()}</Label>
		<p class="text-xs text-muted-foreground">{m.settings_env_activity_highlight_desc()}</p>
	</div>
	<TogglePill bind:checked={highlightChanges} />
</div>

<div class="border-t pt-4 mt-2 space-y-3">
	<div class="flex items-start gap-3">
		<div class="flex-1">
			<Label>{m.settings_env_activity_disk_warning()}</Label>
			<p class="text-xs text-muted-foreground">{m.settings_env_activity_disk_warning_desc()}</p>
		</div>
		<TogglePill bind:checked={diskWarningEnabled} />
	</div>

	{#if diskWarningEnabled}
		<div class="flex items-center gap-3">
			<Select.Root type="single" value={diskWarningMode} onValueChange={(v) => { if (v) diskWarningMode = v as 'percentage' | 'absolute'; }}>
				<Select.Trigger class="w-48">
					<div class="flex items-center gap-2">
						{#if diskWarningMode === 'percentage'}
							<Percent class="w-3.5 h-3.5" />
							<span>{m.settings_env_activity_percentage()}</span>
						{:else}
							<HardDrive class="w-3.5 h-3.5" />
							<span>{m.settings_env_activity_absolute()}</span>
						{/if}
					</div>
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="percentage">
						<div class="flex items-center gap-2">
							<Percent class="w-3.5 h-3.5" />
							{m.settings_env_activity_percentage()}
						</div>
					</Select.Item>
					<Select.Item value="absolute">
						<div class="flex items-center gap-2">
							<HardDrive class="w-3.5 h-3.5" />
							{m.settings_env_activity_absolute()}
						</div>
					</Select.Item>
				</Select.Content>
			</Select.Root>

			{#if diskWarningMode === 'percentage'}
				<Input
					type="number"
					min={1}
					max={100}
					bind:value={diskWarningThreshold}
					class="w-24"
				/>
				<span class="text-sm text-muted-foreground">%</span>
			{:else}
				<Input
					type="number"
					min={1}
					bind:value={diskWarningThresholdGb}
					class="w-24"
				/>
				<span class="text-sm text-muted-foreground">GB</span>
			{/if}
		</div>
	{/if}
</div>
