<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import { Input } from '$lib/components/ui/input';
	import { Calendar, CalendarDays, Clock } from 'lucide-svelte';
	import { appSettings } from '$lib/stores/settings';
	import cronstrue from 'cronstrue/i18n';
	import { getLocale } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	// Reactive time format from settings
	let is12Hour = $derived($appSettings.timeFormat === '12h');

	interface Props {
		value: string | null | undefined;
		onchange: (cron: string) => void;
		disabled?: boolean;
	}

	let { value, onchange, disabled = false }: Props = $props();

	// Defensive: parent stores may hydrate non-string values (number, null, etc.)
	let cronValue = $derived(String(value ?? ''));

	// Detect schedule type from cron expression
	function detectScheduleType(cron: string): 'daily' | 'weekly' | 'custom' {
		const parts = cron.split(' ');
		if (parts.length !== 5) return 'custom';

		const [min, hr, day, month, dow] = parts;

		// Simple minute and hour: plain numbers only (not */n, ranges, or lists)
		const isSimpleNumber = (s: string) => /^\d+$/.test(s);

		// Weekly: specific single day of week (0-6), day and month are wildcards, simple min/hour
		if (dow !== '*' && /^\d$/.test(dow) && day === '*' && month === '*' && isSimpleNumber(min) && isSimpleNumber(hr)) {
			return 'weekly';
		}

		// Daily: all wildcards except simple minute and hour
		if (day === '*' && month === '*' && dow === '*' && isSimpleNumber(min) && isSimpleNumber(hr)) {
			return 'daily';
		}

		return 'custom';
	}

	// Parse cron into components for UI
	let minute = $state('0');
	let hour = $state('3');
	let dayOfWeek = $state('1'); // Monday
	let scheduleType = $state<'daily' | 'weekly' | 'custom'>('daily');

	// Track if component has been initialized
	let initialized = $state(false);
	let previousScheduleType = $state<'daily' | 'weekly' | 'custom'>('daily');
	let isTypingCustom = $state(false); // Track if user is actively typing in custom mode

	// Update UI when value (cron expression) changes externally
	$effect(() => {
		if (cronValue) {
			const parts = cronValue.split(' ');
			if (parts.length >= 5) {
				minute = parts[0] || '0';
				hour = parts[1] || '3';
				dayOfWeek = parts[4] !== '*' ? parts[4] : '1'; // Default to Monday

				// Only update schedule type if not actively typing in custom mode
				if (!isTypingCustom) {
					scheduleType = detectScheduleType(cronValue);
				}
			}
		}

		// Mark as initialized after first parse
		if (!initialized) {
			initialized = true;
			previousScheduleType = scheduleType;
		}
	});

	// Generate cron expression from UI inputs
	function updateCronExpression() {
		let newCron = '';

		if (scheduleType === 'daily') {
			newCron = `${minute} ${hour} * * *`;
		} else if (scheduleType === 'weekly') {
			newCron = `${minute} ${hour} * * ${dayOfWeek}`;
		} else {
			// For custom, keep the current value
			return;
		}

		onchange(newCron);
	}

	// Handle schedule type change
	function handleScheduleTypeChange(newType: string) {
		const type = newType as 'daily' | 'weekly' | 'custom';
		scheduleType = type;

		// Set flag when switching to custom mode
		if (type === 'custom') {
			isTypingCustom = true;
		} else {
			isTypingCustom = false;
		}

		// Only reset to defaults if schedule type actually changed after initialization
		if (initialized && type !== previousScheduleType) {
			if (type === 'daily') {
				minute = '0';
				hour = '3';
				onchange('0 3 * * *');
			} else if (type === 'weekly') {
				minute = '0';
				hour = '3';
				dayOfWeek = '1'; // Monday
				onchange('0 3 * * 1');
			}
			previousScheduleType = type;
		}
	}

	function handleMinuteChange(value: string) {
		minute = value;
		updateCronExpression();
	}

	function handleHourChange(value: string) {
		hour = value;
		updateCronExpression();
	}

	function handleDayOfWeekChange(value: string) {
		dayOfWeek = value;
		updateCronExpression();
	}

	function handleCustomCronInput(e: Event) {
		const newValue = (e.currentTarget as HTMLInputElement).value;
		onchange(newValue);
	}

	// Validate cron expression (supports 5-field and 6-field with seconds)
	function isValidCron(cron: string): boolean {
		const parts = cron.trim().split(/\s+/);
		if (parts.length !== 5 && parts.length !== 6) return false;

		// Basic pattern validation (number, *, */n, range, list)
		const cronFieldPattern = /^(\*|(\*\/\d+)|\d+(-\d+)?(,\d+(-\d+)?)*)$/;

		return parts.every((part) => cronFieldPattern.test(part));
	}

	// Map Paraglide locale to cronstrue locale
	let cronLocale = $derived(getLocale() === 'zh-CN' ? 'zh_CN' : 'en');

	// Human-readable description using cronstrue
	let humanReadable = $derived(() => {
		if (!cronValue) return '';
		if (!cronValue.trim()) return '';

		// Validate first
		if (!isValidCron(cronValue)) {
			return m.cron_invalid();
		}

		try {
			// Use cronstrue to parse the cron expression
			// Configure it to use the user's time format preference
			const description = cronstrue.toString(cronValue, {
				use24HourTimeFormat: !is12Hour,
				throwExceptionOnParseError: true,
				locale: cronLocale
			});
			return description;
		} catch (error) {
			return m.cron_invalid();
		}
	});

	// Generate hours array based on time format preference. 24h shows just the
	// 2-digit hour so the combined picker reads "at 03 :15" rather than
	// the confusing "at 03:00 :15" (#1198).
	const hours = $derived(
		Array.from({ length: 24 }, (_, i) => ({
			value: String(i),
			label: is12Hour
				? i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`
				: i.toString().padStart(2, '0')
		}))
	);

	// 5-minute granularity — fine enough to stagger notifications without
	// drowning the dropdown in 60 entries (#1198).
	const minutes = Array.from({ length: 12 }, (_, i) => ({
		value: String(i * 5),
		label: ':' + (i * 5).toString().padStart(2, '0')
	}));

	const daysOfWeek = [
		{ value: '1', label: m.cron_monday() },
		{ value: '2', label: m.cron_tuesday() },
		{ value: '3', label: m.cron_wednesday() },
		{ value: '4', label: m.cron_thursday() },
		{ value: '5', label: m.cron_friday() },
		{ value: '6', label: m.cron_saturday() },
		{ value: '0', label: m.cron_sunday() }
	];
</script>

<div class="flex items-center gap-2 flex-wrap">
	<!-- Schedule Type Selector -->
	<Select.Root type="single" value={scheduleType} onValueChange={handleScheduleTypeChange} {disabled}>
		<Select.Trigger class="w-[140px] h-9">
			<div class="flex items-center gap-2">
				{#if scheduleType === 'daily'}
					<Calendar class="w-4 h-4" />
					<span>{m.cron_daily()}</span>
				{:else if scheduleType === 'weekly'}
					<CalendarDays class="w-4 h-4" />
					<span>{m.cron_weekly()}</span>
				{:else}
					<Clock class="w-4 h-4" />
					<span>{m.cron_custom()}</span>
				{/if}
			</div>
		</Select.Trigger>
		<Select.Content>
			<Select.Item value="daily">
				<div class="flex items-center gap-2">
					<Calendar class="w-4 h-4" />
					<span>{m.cron_daily()}</span>
				</div>
			</Select.Item>
			<Select.Item value="weekly">
				<div class="flex items-center gap-2">
					<CalendarDays class="w-4 h-4" />
					<span>{m.cron_weekly()}</span>
				</div>
			</Select.Item>
			<Select.Item value="custom">
				<div class="flex items-center gap-2">
					<Clock class="w-4 h-4" />
					<span>{m.cron_custom()}</span>
				</div>
			</Select.Item>
		</Select.Content>
	</Select.Root>

	{#if scheduleType === 'daily' || scheduleType === 'weekly'}
		<!-- Time Selectors -->
		<span class="text-sm text-muted-foreground">{m.cron_at()}</span>
		<Select.Root type="single" value={hour} onValueChange={handleHourChange} {disabled}>
			<Select.Trigger class="w-[100px] h-9">
				<span>{hours.find((h: { value: string; label: string }) => h.value === hour)?.label || hour}</span>
			</Select.Trigger>
			<Select.Content>
				{#each hours as h}
					<Select.Item value={h.value} label={h.label} />
				{/each}
			</Select.Content>
		</Select.Root>
		<Select.Root type="single" value={minute} onValueChange={handleMinuteChange} {disabled}>
			<Select.Trigger class="w-[70px] h-9">
				<span>{minutes.find(m => m.value === minute)?.label || `:${minute}`}</span>
			</Select.Trigger>
			<Select.Content>
				{#each minutes as m}
					<Select.Item value={m.value} label={m.label} />
				{/each}
			</Select.Content>
		</Select.Root>

		{#if scheduleType === 'weekly'}
			<span class="text-sm text-muted-foreground">{m.cron_on()}</span>
			<Select.Root type="single" value={dayOfWeek} onValueChange={handleDayOfWeekChange} {disabled}>
				<Select.Trigger class="w-[110px] h-9">
					<span>{daysOfWeek.find(d => d.value === dayOfWeek)?.label || dayOfWeek}</span>
				</Select.Trigger>
				<Select.Content>
					{#each daysOfWeek as d}
						<Select.Item value={d.value} label={d.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		{/if}

	{:else}
		<!-- Custom cron input -->
		{@const readable = humanReadable()}
		{@const isInvalid = readable === m.cron_invalid()}
		<Input
			value={cronValue}
			oninput={handleCustomCronInput}
			placeholder={m.cron_placeholder()}
			class="h-9 font-mono flex-1 min-w-[200px] {isInvalid ? 'border-destructive focus-visible:ring-destructive' : ''}"
			{disabled}
		/>
	{/if}
</div>

<!-- Description area with fixed height -->
<div class="min-h-[20px] mt-1">
	{#if cronValue}
		{@const readable = humanReadable()}
		{@const isInvalid = readable === m.cron_invalid()}
		<p class="text-xs {isInvalid ? 'text-destructive' : 'text-muted-foreground'}">
			{readable}
		</p>
	{/if}
</div>
