<template>
  <div class="loot-row">
    <!-- ACTIVE variant: placeholder slots with loot overlays -->
    <template v-if="isActive">
      <div
        v-for="index in activeSlots"
        :key="`slot-${animationCycle}-${index}`"
        class="loot-slot-container"
        :class="{ 'loot-slot-container--extra': index >= BASE_SLOT_COUNT }"
      >
        <div class="loot-placeholder">
          <ItemImage
            :item="getPlaceholderItem(index)"
            :size="64"
            rounded="0"
            :tooltip="false"
            :text-overlay="false"
            class="loot-item-image"
          />
        </div>

        <div
          v-if="lootItems[index]"
          class="loot-overlay"
          :class="{ revealed: showLoot }"
          :style="{ '--fly-delay': `${index * 150}ms` }"
        >
          <div class="loot-overlay__content" :class="{ fading: isFading }">
            <ItemImage
              :item="lootItems[index]"
              :size="64"
              rounded="0"
              text-overlay-style="shadow"
              text-overlay-position="bottom-center"
              class="loot-item-image"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- PASSIVE variant: immediate display, no animations or placeholders -->
    <template v-else>
      <div
        v-for="(item, index) in lootItems"
        :key="index"
        class="loot-slot loot-slot--passive"
      >
        <ItemImage
          :item="item"
          :size="64"
          rounded="0"
          text-overlay-style="shadow"
          text-overlay-position="bottom-center"
          class="loot-item-image"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import ItemImage from "@/components/BLCKeyClicker/ItemImage.vue";
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { storeToRefs } from "pinia";
import { useLootStore } from "@/store/loot/lootStore";
import statuetteImg from "@/assets/item/statuette.png";
import d6PlaceholderImg from "@/assets/BLCOpenUI/d6PlaceHolder.png";

const BASE_SLOT_COUNT = 4;
const LOOT_DISPLAY_MS = 2500;
const FADE_DURATION_MS = 600;

const props = defineProps({
  variant: {
    type: String,
    default: "active",
    validator: (v) => ["active", "passive"].includes(v),
  },
});

const lootStore = useLootStore();
const { currentChestConfig } = storeToRefs(lootStore);

const lootItems = ref([]);
const showLoot = ref(false);
const isFading = ref(false);
const animationCycle = ref(0);

const isActive = computed(() => props.variant === "active");

const guaranteedItem = computed(() =>
  currentChestConfig.value?.sets?.guaranteedItem?.items?.[0] ?? null,
);

const slotCount = computed(() =>
  Math.max(BASE_SLOT_COUNT, lootItems.value.length),
);

const activeSlots = computed(() =>
  Array.from({ length: slotCount.value }, (_, i) => i),
);

function getPlaceholderItem(index) {
  if (index === 0) {
    return { name: "Black Lion Statuette", icon: statuetteImg };
  }
  if (index === 1 && guaranteedItem.value) {
    return guaranteedItem.value;
  }
  return { name: "Random Drop", icon: d6PlaceholderImg };
}

let fadeTimeoutId = null;
let clearTimeoutId = null;

function clearTimers() {
  if (fadeTimeoutId !== null) {
    window.clearTimeout(fadeTimeoutId);
    fadeTimeoutId = null;
  }
  if (clearTimeoutId !== null) {
    window.clearTimeout(clearTimeoutId);
    clearTimeoutId = null;
  }
}

function reset() {
  clearTimers();
  showLoot.value = false;
  isFading.value = false;
  lootItems.value = [];
}

async function displayLoot(items = []) {
  clearTimers();
  isFading.value = false;

  if (isActive.value) {
    showLoot.value = false;
    lootItems.value = [];
    await nextTick();

    animationCycle.value += 1;
    lootItems.value = [...items];
    showLoot.value = true;

    const totalFlyInMs = items.length * 150 + 550;

    fadeTimeoutId = window.setTimeout(() => {
      fadeTimeoutId = null;
      isFading.value = true;

      clearTimeoutId = window.setTimeout(() => {
        clearTimeoutId = null;
        showLoot.value = false;
        isFading.value = false;
        lootItems.value = [];
      }, FADE_DURATION_MS);
    }, totalFlyInMs + LOOT_DISPLAY_MS);
  } else {
    lootItems.value = [...items];
    showLoot.value = true;
  }
}

defineExpose({ displayLoot, reset });

onBeforeUnmount(() => {
  clearTimers();
});
</script>

<style scoped>
.loot-row {
  display: flex;
  justify-content: center;
  gap: 8px;
  min-height: 64px;
}

/* --- Active variant: slot containers with placeholder + overlay --- */

.loot-slot-container {
  position: relative;
  width: 64px;
  height: 64px;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 4px;
  flex-shrink: 0;
}

.loot-slot-container--extra {
  border-color: rgba(var(--v-theme-on-surface), 0.08);
}

.loot-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.34;
  filter: grayscale(1) brightness(0.65);
}

.loot-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: translateY(-120px) scale(0);
  z-index: 1;
}

.loot-overlay.revealed {
  animation: fly-out 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  animation-delay: var(--fly-delay);
}

.loot-overlay__content {
  transition: opacity var(--fade-duration, 0.6s) ease-out;
}

.loot-overlay__content.fading {
  opacity: 0;
}

/* --- Passive variant: static display --- */

.loot-slot--passive {
  display: flex;
  align-items: center;
  justify-content: center;
}

.loot-item-image {
  display: block;
}

@keyframes fly-out {
  0% {
    opacity: 0;
    transform: translateY(-120px) scale(0);
  }
  35% {
    opacity: 1;
    transform: translateY(-15px) scale(1.12);
  }
  65% {
    transform: translateY(6px) scale(0.96);
  }
  85% {
    transform: translateY(-2px) scale(1.02);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
