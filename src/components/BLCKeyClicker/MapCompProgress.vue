<template>
  <div class="map-comp-progress">
    <div class="progress-wrapper">
      <MapCompBackgroundLayer />
      <v-progress-circular
        :model-value="ringDisplayValue"
        :size="400"
        :width="20"
        color="cyan-darken-3"
        rounded
        class="progress-ring"
      />
      <div class="reward-flyout-layer">
        <img
          v-for="reward in rewardFlyouts"
          :key="reward.id"
          :src="reward.src"
          :alt="reward.alt"
          class="reward-flyout"
          :style="reward.style"
          @animationend="removeRewardFlyout(reward.id)"
        />
      </div>
      <MapCompButton class="centered-btn" @click="handleClick" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, watch } from "vue";
import { storeToRefs } from "pinia";
import BLCKeyImg from "@/assets/item/BLCKey.png";
import TransmutationChargeImg from "@/assets/item/TransmutationCharge.png";
import MapCompBackgroundLayer from "@/components/BLCKeyClicker/MapCompBackgroundLayer.vue";
import MapCompButton from "@/components/BLCKeyClicker/MapCompButton.vue";
import { useBLCKeyClickerSaveStore } from "@/store/BLCKeyClickerSaveStore";

const MAX_REWARD_FLYOUTS = 10;

const emit = defineEmits(["click", "mapComplete"]);
const saveStore = useBLCKeyClickerSaveStore();
const {
  mapCompClicksToComp,
  mapCompProgress,
  mapCompCompletionEvents,
} = storeToRefs(saveStore);
const rewardFlyouts = ref([]);
const lastProcessedMapCompCompletionEventId = ref(
  mapCompCompletionEvents.value.length
    ? mapCompCompletionEvents.value[mapCompCompletionEvents.value.length - 1].id
    : -1
);
let nextRewardFlyoutId = 0;

const rewardImageByType = {
  blcKey: BLCKeyImg,
  transmutationCharge: TransmutationChargeImg,
};

// Persistent Image objects prevent the browser from dropping decoded image data
const _rewardImageAnchors = [];
Object.values(rewardImageByType).forEach((src) => {
  const img = new Image();
  img.src = src;
  _rewardImageAnchors.push(img);
});

// --- Progress ring delayed reset ---
const progressOverride = ref(null);
let resetTimer = null;

const ringDisplayValue = computed(() => {
  const p =
    progressOverride.value !== null ? progressOverride.value : mapCompProgress.value;
  return (p / mapCompClicksToComp.value) * 100;
});

onBeforeUnmount(() => {
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
});

function getRewardFlyoutStyle() {
  const angle = Math.random() * Math.PI * 2;
  const MAX_DISTANCE = 250;
  const distance = MAX_DISTANCE * 0.8 + Math.random() * MAX_DISTANCE * 0.2;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;
  const rotation = -20 + Math.random() * 40;
  const scale = 0.9 + Math.random() * 0.25;

  return {
    "--flyout-x": `${x.toFixed(2)}px`,
    "--flyout-y": `${y.toFixed(2)}px`,
    "--flyout-rotation": `${rotation.toFixed(2)}deg`,
    "--flyout-scale": scale.toFixed(2),
  };
}

function showRewardFlyout(src) {
  rewardFlyouts.value.push({
    id: nextRewardFlyoutId++,
    src,
    alt: "Map completion reward",
    style: getRewardFlyoutStyle(),
  });
  if (rewardFlyouts.value.length > MAX_REWARD_FLYOUTS) {
    rewardFlyouts.value.splice(
      0,
      rewardFlyouts.value.length - MAX_REWARD_FLYOUTS
    );
  }
}

function removeRewardFlyout(id) {
  rewardFlyouts.value = rewardFlyouts.value.filter((reward) => reward.id !== id);
}

function holdCompletedProgressRing() {
  // If a delayed reset is pending, cancel it and let the latest completion win
  if (progressOverride.value !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
    progressOverride.value = null;
  }

  // Completion — hold the ring at 100% for 5 seconds before dropping to 0
  progressOverride.value = mapCompClicksToComp.value;
  resetTimer = setTimeout(() => {
    progressOverride.value = null;
    resetTimer = null;
  }, 5000);
}

function handleMapComplete(mapCompCompletionEvent) {
  holdCompletedProgressRing();
  const rewardImage = rewardImageByType[mapCompCompletionEvent.reward.type];

  if (rewardImage) {
    showRewardFlyout(rewardImage);
  }

  emit("mapComplete", mapCompCompletionEvent);
}

watch(
  () =>
    mapCompCompletionEvents.value.length
      ? mapCompCompletionEvents.value[mapCompCompletionEvents.value.length - 1].id
      : -1,
  () => {
    const newCompletionEvents = mapCompCompletionEvents.value.filter(
      (event) => event.id > lastProcessedMapCompCompletionEventId.value
    );

    newCompletionEvents.forEach((event) => {
      handleMapComplete(event);
      lastProcessedMapCompCompletionEventId.value = event.id;
    });
  }
);

function handleClick() {
  emit("click");
  saveStore.advanceMapCompletion("mapCompButton");
}

// defineExpose({ ringDisplayValue, showRewardFlyout });
</script>

<style scoped>
.map-comp-progress {
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-wrapper {
  position: relative;
  display: grid;
  place-items: center;
  overflow: visible;
}

.progress-ring {
  grid-area: 1 / 1;
}

.reward-flyout-layer {
  grid-area: 1 / 1;
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}

.centered-btn {
  grid-area: 1 / 1;
}

.reward-flyout {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 48px;
  height: 48px;
  object-fit: contain;
  opacity: 0;
  box-shadow: 0 0 10px 0 rgb(var(--v-theme-on-background), 1);
  transform: translate(-50%, -50%) scale(0.3);
  will-change: transform, opacity;
  animation: reward-flyout 1.6s ease-out forwards;
}

@keyframes reward-flyout {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.3);
  }
  20% {
    opacity: 1;
    transform: translate(
        calc(-50% + (var(--flyout-x) * 0.55)),
        calc(-50% + (var(--flyout-y) * 0.55))
      )
      rotate(var(--flyout-rotation)) scale(var(--flyout-scale));
  }
  65% {
    opacity: 1;
    transform: translate(calc(-50% + var(--flyout-x)), calc(-50% + var(--flyout-y)))
      rotate(var(--flyout-rotation)) scale(var(--flyout-scale));
  }
  100% {
    opacity: 0;
    transform: translate(calc(-50% + var(--flyout-x)), calc(-50% + var(--flyout-y)))
      rotate(var(--flyout-rotation)) scale(var(--flyout-scale));
  }
}
</style>
