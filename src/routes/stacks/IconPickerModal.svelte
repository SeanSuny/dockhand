<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { stackIconMap, getStackIconComponent } from '$lib/utils/icons';
	import * as m from '$lib/paraglide/messages';
	import { Upload, Search, Loader2, ExternalLink, ImageOff } from 'lucide-svelte';
	import AvatarCropper from '$lib/components/AvatarCropper.svelte';

	interface Props {
		open: boolean;
		/** Current icon value (lucide name / selfhst:<ref> / custom:...). */
		value?: string | null;
		/** Called with the chosen value string, or '' to clear. */
		onselect: (icon: string) => void;
		/** Dialog heading - defaults to a generic label; callers can scope it. */
		title?: string;
	}

	let { open = $bindable(false), value = null, onselect, title = m.stacks_icon_title() }: Props = $props();

	// --- Lucide tab ---
	const lucideNames = Object.keys(stackIconMap);
	let lucideQuery = $state('');
	const filteredLucide = $derived(
		lucideQuery.trim()
			? lucideNames.filter((n) => n.includes(lucideQuery.trim().toLowerCase()))
			: lucideNames
	);

	function pickLucide(name: string) {
		onselect(name);
		open = false;
	}

	// --- selfh.st tab (lazy) ---
	interface SelfhstEntry { Name: string; Reference: string; SVG: string }
	let manifest = $state<SelfhstEntry[]>([]);
	let manifestLoading = $state(false);
	let manifestError = $state('');
	let selfhstQuery = $state('');

	async function loadManifest() {
		if (manifest.length || manifestLoading) return;
		manifestLoading = true;
		manifestError = '';
		try {
			const res = await fetch('/api/icons/selfhst-manifest');
			if (!res.ok) throw new Error(`manifest ${res.status}`);
			const all = (await res.json()) as SelfhstEntry[];
			// Only SVG-capable entries (that's what our proxy serves).
			manifest = all.filter((e) => e.SVG === 'Yes' && e.Reference);
		} catch (e) {
			manifestError = m.stacks_icon_load_error();
		} finally {
			manifestLoading = false;
		}
	}

	// Cap the rendered result count so a blank query doesn't try to lazy-load 2800 icons.
	const selfhstResults = $derived(
		(selfhstQuery.trim()
			? manifest.filter(
					(e) =>
						e.Name.toLowerCase().includes(selfhstQuery.trim().toLowerCase()) ||
						e.Reference.includes(selfhstQuery.trim().toLowerCase())
				)
			: manifest
		).slice(0, 120)
	);

	function pickSelfhst(ref: string) {
		onselect(`selfhst:${ref}`);
		open = false;
	}

	function onTabChange(v: string) {
		if (v === 'selfhst') loadManifest();
	}

	// --- Upload tab (crop like env icons) ---
	let iconCropperImageUrl = $state('');
	let showIconCropper = $state(false);

	function onFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			iconCropperImageUrl = reader.result as string;
			input.value = '';
			showIconCropper = true;
		};
		reader.readAsDataURL(file);
	}

	// The cropped 128px webp data URL goes to the parent, which owns the stack name
	// and POSTs it (same flow env icons use).
	function handleIconCropSave(dataUrl: string) {
		showIconCropper = false;
		onselect(`upload:${dataUrl}`);
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-w-2xl h-[640px] flex flex-col">
		<Dialog.Header class="shrink-0">
			<Dialog.Title>{title}</Dialog.Title>
		</Dialog.Header>

		<Tabs.Root value="icons" onValueChange={onTabChange} class="flex-1 flex flex-col min-h-0">
			<Tabs.List class="grid grid-cols-3 shrink-0">
				<Tabs.Trigger value="icons">{m.stacks_icon_tab_icons()}</Tabs.Trigger>
				<Tabs.Trigger value="selfhst">{m.stacks_icon_tab_logos()}</Tabs.Trigger>
				<Tabs.Trigger value="upload">{m.stacks_icon_tab_upload()}</Tabs.Trigger>
			</Tabs.List>

			<!-- Lucide icons -->
			<Tabs.Content value="icons" class="mt-3 flex-1 min-h-0 data-[state=active]:flex flex-col">
				<div class="relative mb-3 shrink-0">
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input bind:value={lucideQuery} placeholder={m.stacks_icon_search_icons()} class="pl-8" />
				</div>
				<div class="grid grid-cols-12 gap-1 flex-1 overflow-y-auto pr-1 content-start">
					{#each filteredLucide as name (name)}
						{@const Icon = getStackIconComponent(name)}
						<button
							type="button"
							title={name}
							onclick={() => pickLucide(name)}
							class="flex items-center justify-center aspect-square rounded-md border hover:bg-accent hover:border-primary transition-colors {value === name ? 'border-primary bg-accent' : 'border-transparent'}"
						>
							<Icon class="w-4 h-4" />
						</button>
					{/each}
				</div>
			</Tabs.Content>

			<!-- selfh.st app logos -->
			<Tabs.Content value="selfhst" class="mt-3 flex-1 min-h-0 data-[state=active]:flex flex-col">
				<div class="relative mb-3 shrink-0">
					<Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
					<Input bind:value={selfhstQuery} placeholder={m.stacks_icon_search_logos()} class="pl-8" />
				</div>
				<div class="flex-1 min-h-0 overflow-y-auto pr-1">
					{#if manifestLoading}
						<div class="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
							<Loader2 class="w-4 h-4 animate-spin" /> Loading icon list...
						</div>
					{:else if manifestError}
						<div class="flex flex-col items-center gap-2 py-10 text-muted-foreground text-sm">
							<ImageOff class="w-6 h-6" />
							<span class="text-center max-w-sm">{manifestError}</span>
						</div>
					{:else}
						<div class="grid grid-cols-12 gap-1 content-start">
							{#each selfhstResults as entry (entry.Reference)}
								<button
									type="button"
									title={entry.Name}
									onclick={() => pickSelfhst(entry.Reference)}
									class="flex items-center justify-center aspect-square rounded-md border p-1 hover:bg-accent hover:border-primary transition-colors {value === `selfhst:${entry.Reference}` ? 'border-primary bg-accent' : 'border-transparent'}"
								>
									<img src="/api/icons/selfhst/{entry.Reference}" alt={entry.Name} loading="lazy" class="w-full h-full object-contain" />
								</button>
							{/each}
						</div>
						{#if selfhstResults.length === 0 && selfhstQuery.trim()}
							<p class="py-8 text-center text-sm text-muted-foreground">{m.stacks_icon_no_logos({ query: selfhstQuery })}</p>
						{/if}
					{/if}
				</div>
				<p class="mt-3 shrink-0 text-[11px] text-muted-foreground leading-relaxed">
					{@html m.stacks_icon_attribution()}
				</p>
				<p class="mt-1 text-[11px] text-muted-foreground leading-relaxed">
					{@html m.stacks_icon_legal()}
				</p>
			</Tabs.Content>

			<!-- Upload -->
			<Tabs.Content value="upload" class="mt-3 flex-1 min-h-0 data-[state=active]:flex flex-col justify-center gap-3">
				<label class="flex flex-col items-center justify-center gap-2 py-12 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors">
					<Upload class="w-6 h-6 text-muted-foreground" />
					<span class="text-sm text-muted-foreground">{m.stacks_icon_upload_label()}</span>
					<span class="text-xs text-muted-foreground">{m.stacks_icon_upload_formats()}</span>
					<input type="file" accept="image/*" class="hidden" onchange={onFileSelect} />
				</label>
			</Tabs.Content>
		</Tabs.Root>

		<Dialog.Footer>
			{#if value}
				<Button variant="ghost" onclick={() => { onselect(''); open = false; }}>{m.stacks_icon_clear()}</Button>
			{/if}
		</Dialog.Footer>

		<AvatarCropper
			show={showIconCropper}
			imageUrl={iconCropperImageUrl}
			cropShape="round"
			outputSize={128}
			outputFormat="image/webp"
			outputQuality={0.85}
			title={m.stacks_icon_crop_title()}
			saveLabel={m.stacks_icon_save_label()}
			onCancel={() => (showIconCropper = false)}
			onSave={handleIconCropSave}
		/>
	</Dialog.Content>
</Dialog.Root>
