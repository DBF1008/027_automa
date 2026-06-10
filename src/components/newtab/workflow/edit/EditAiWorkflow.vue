<template>
  <div>
    <ui-button
      variant="accent"
      class="text-sm w-full"
      @click="state.showAIPowerTokenModal = true"
    >
      <span class="flex justify-between items-center w-full">
        <span class="flex items-center space-x-1">
          <v-remixicon name="riKey" size="16"></v-remixicon>
          <span>Configure AI Power Token</span>
        </span>
        <v-remixicon name="riArrowRightLine" size="16"></v-remixicon>
      </span>
    </ui-button>

    <template v-if="aiPowerToken">
      <ui-paginated-select
        :key="aiPowerToken"
        :model-value="data.flowUuid"
        :initial-label="data.flowLabel"
        :load-options="loadWorkflows"
        option-value-key="flowUuid"
        option-label-key="name"
        class="mt-4 w-full"
        label="Select Workflows"
        placeholder="Select a workflow"
        search-placeholder="Search workflows..."
        @change="onFlowChange"
      >
        <template #footer>
          <ui-button class="w-full" @click="createNewWorkflow">
            <v-remixicon name="riAddLine" class="mr-2" />
            New AI Workflow
          </ui-button>
        </template>
      </ui-paginated-select>

      <div
        class="w-full my-6 relative flex items-center justify-center bg-[#e4e4e7] h-[1px]"
      ></div>

      <div class="my-4">
        <div class="flex items-center justify-between">
          <p class="font-semibold">Workflow Inputs</p>
          <ui-button
            v-if="data.inputs && data.inputs.length && data.flowUuid"
            variant="default"
            class="text-sm"
            @click="savePreset"
          >
            <v-remixicon name="riSaveLine" size="14" class="mr-1" />
            Save Preset
          </ui-button>
        </div>
        <div v-if="presets.length" class="mt-2">
          <label class="ml-1 text-sm text-gray-600 dark:text-gray-200">
            Load Preset
          </label>
          <div
            v-for="preset in presets"
            :key="preset.id"
            class="flex items-center justify-between rounded-lg px-3 py-2 mt-1 bg-input hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group"
            @click="applyPreset(preset)"
          >
            <span class="text-sm truncate flex-1">{{ preset.name }}</span>
            <v-remixicon
              name="riDeleteBinLine"
              size="16"
              class="text-red-400 opacity-0 group-hover:opacity-100 cursor-pointer ml-2 flex-shrink-0"
              @click.stop="deletePreset(preset.id)"
            />
          </div>
        </div>
        <template v-if="data.inputs && data.inputs.length">
          <div
            v-for="(item, index) in data.inputs"
            :key="`${data.flowUuid}-${item.name}`"
          >
            <component
              :is="getComponent(item.type)"
              :label="`${item.label} (${item.type})`"
              :placeholder="item.name || null"
              :model-value="item.value"
              :accept="item.accept"
              :max-size="item.maxSize"
              :on-upload="handleUploadFile"
              class="w-full my-2"
              @change="onInputParamsChange(item, index, $event)"
            />
          </div>
        </template>
        <template v-else>
          <p class="text-sm text-gray-500">No inputs</p>
        </template>
      </div>

      <div class="my-4">
        <p class="font-semibold">Workflow Outputs(view only)</p>
        <template v-if="data.outputs && data.outputs.length">
          <ui-input
            v-for="(item, index) in data.outputs"
            :key="index"
            :label="`${item.label} (${item.type})`"
            :placeholder="item.name || null"
            readonly
            class="w-full my-2"
          />
        </template>
        <template v-else>
          <p class="text-sm text-gray-500">No outputs</p>
        </template>
      </div>

      <div class="my-4">
        <insert-workflow-data :data="data" variables @update="updateData" />
      </div>

      <span class="text-sm text-gray-500 block text-center mt-10"
        >Powered by Automa
        <a href="https://aipower.automa.site/">AI Power</a></span
      >
    </template>

    <ui-modal
      v-model="state.showAIPowerTokenModal"
      title="Configure AI Power Token"
    >
      <div class="mb-6">
        <p>
          <span class="text-gray-500 text-[14px] leading-[24px]"
            >Enter your AI Power token to enable AI Workflow features</span
          >
        </p>
      </div>

      <div
        class="bg-[#f2f2f2] dark:bg-gray-900 mb-6 p-6 rounded-lg w-full space-y-4"
      >
        <p
          class="font-semibold text-[16px] dark:text-gray-300 leading-[24px] flex items-center"
        >
          <v-remixicon name="riKey" size="16" class="mr-1"></v-remixicon>
          How to get your AI Power Token
        </p>

        <ol
          class="space-y-2 list-decimal list-inside text-sm text-gray-600 dark:text-gray-400"
        >
          <li>Go to Settings → Authorizations in your AI Power dashboard</li>
          <li>Navigate to "AI Power Authorization" section</li>
          <li>Click "Generate New Token" to create a new token</li>
          <li>Copy the generated token and paste it below</li>
        </ol>

        <ui-button variant="default" @click="goToAIPowerSettings">
          <span class="text-[14px] leading-[24px]">Open AI Power Settings</span>
          <v-remixicon name="riArrowRightUpLine" size="16"></v-remixicon>
        </ui-button>
      </div>

      <div class="flex flex-col space-y-4 mb-4">
        <span class="text-sm text-gray-500 font-semibold">AI Power Token</span>
        <ui-input
          :model-value="aiPowerToken"
          class="w-full"
          placeholder="Enter your AI Power Token..."
          @change="updateAIPowerToken"
        />
      </div>

      <div class="flex justify-end space-x-2">
        <ui-button
          variant="default"
          @click="state.showAIPowerTokenModal = false"
          >Cancel</ui-button
        >
        <ui-button variant="accent" @click="saveAIPowerToken">Save</ui-button>
      </div>
    </ui-modal>
  </div>
</template>

<script>
const flowDetailCache = new Map();
</script>

<script setup>
import { useDialog } from '@/composable/dialog';
import UiFileInput from '@/components/ui/UiFileInput.vue';
import UiInput from '@/components/ui/UiInput.vue';
import UiPaginatedSelect from '@/components/ui/UiPaginatedSelect.vue';
import { useWorkflowStore } from '@/stores/workflow';
import {
  getAPFlowList,
  getAPWorkflowDetail,
  postUploadFile,
} from '@/utils/getAIPoweredInfo';
import cloneDeep from 'lodash.clonedeep';
import { nanoid } from 'nanoid';
import secrets from 'secrets';
import {
  computed,
  defineEmits,
  defineProps,
  shallowReactive,
  shallowRef,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from 'vue-toastification';
import browser from 'webextension-polyfill';
import InsertWorkflowData from './InsertWorkflowData.vue';

const toast = useToast();
const dialog = useDialog();
const presets = shallowRef([]);

const props = defineProps({
  data: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['update:data']);

function updateData(value) {
  emit('update:data', { ...props.data, ...value });
}

const getComponent = (type) => {
  const uploadTypes = ['VIDEO', 'IMAGE', 'AUDIO', 'FILE'];
  if (uploadTypes.includes(type)) {
    return UiFileInput;
  }
  return UiInput;
};

const state = shallowReactive({
  showAIPowerTokenModal: false,
});

const { id: workflowId } = useRoute().params;
const workflowStore = useWorkflowStore();
const currentWorkflow = workflowStore.getById(workflowId);

const aiPowerToken = computed(() => {
  return currentWorkflow?.settings?.aipowerToken;
});

const handleUploadFile = async (file) => {
  try {
    const res = await postUploadFile(file, aiPowerToken.value);
    if (res.success) {
      return {
        url: res.data.fileReadUrl,
        filename: file.name,
      };
    }
    throw new Error(res.msg || 'File upload failed');
  } catch (error) {
    console.error(error);
    throw error;
  }
};

const createNewWorkflow = () => {
  browser.tabs.create({
    url: secrets.apCreateWorkflowUrl,
  });
};

const clearInputsAndOutputs = () => {
  updateData({
    inputs: [],
    outputs: [],
    flowUuid: '',
    flowLabel: '',
  });
};

const loadWorkflows = async ({ query, page }) => {
  try {
    const pageSize = 10;
    const res = await getAPFlowList(
      { page, size: pageSize, name: query },
      aiPowerToken.value
    );

    if (res.success) {
      return {
        data: res.data,
        hasMore: res.page.pages > res.page.page,
      };
    }
    toast.error(`Failed to fetch AI Power workflows: ${res.msg}`);
    return { data: [], hasMore: false };
  } catch (err) {
    console.error(err);
    toast.error(`${err.message}`);
    return { data: [], hasMore: false };
  }
};
const goToAIPowerSettings = () => {
  const url = `${secrets.apHomeUrl}/authorization`;

  window.open(url, '_blank');
};

const updateAIPowerToken = (value) => {
  state.aipowerToken = value;
};

const saveAIPowerToken = () => {
  const oldToken = currentWorkflow.settings.aipowerToken;
  const newToken = state.aipowerToken;

  // Do nothing if token hasn't changed.
  if (newToken === oldToken) {
    state.showAIPowerTokenModal = false;
    return;
  }

  const newSettings = {
    ...currentWorkflow.settings,
    aipowerToken: newToken,
  };

  workflowStore.update({
    id: workflowId,
    data: {
      ...currentWorkflow,
      settings: newSettings,
    },
  });
  state.showAIPowerTokenModal = false;

  flowDetailCache.clear();
  clearInputsAndOutputs();
};

const onFlowChange = (value, label) => {
  updateData({ flowUuid: value, flowLabel: label });
};

const onInputParamsChange = (item, index, value) => {
  const newInputs = cloneDeep(props.data.inputs);
  newInputs[index].value = value;
  updateData({ inputs: newInputs });
};

async function loadPresets() {
  const token = aiPowerToken.value;
  const flowUuid = props.data.flowUuid;
  if (!token || !flowUuid) {
    presets.value = [];
    return;
  }
  const storage = await browser.storage.local.get('aiWorkflowPresets');
  const allPresets = storage.aiWorkflowPresets || {};
  const tokenPresets = allPresets[token] || [];
  presets.value = tokenPresets.filter((p) => p.flowUuid === flowUuid);
}

function savePreset() {
  dialog.prompt({
    title: 'Save Input Preset',
    placeholder: 'Preset name...',
    okText: 'Save',
    onConfirm: async (name) => {
      if (!name || !name.trim()) return false;

      const storage = await browser.storage.local.get('aiWorkflowPresets');
      const allPresets = storage.aiWorkflowPresets || {};
      const token = aiPowerToken.value;
      if (!allPresets[token]) {
        allPresets[token] = [];
      }

      allPresets[token].push({
        id: nanoid(),
        name: name.trim(),
        flowUuid: props.data.flowUuid,
        flowLabel: props.data.flowLabel,
        inputs: cloneDeep(props.data.inputs),
        createdAt: Date.now(),
      });

      await browser.storage.local.set({ aiWorkflowPresets: allPresets });
      await loadPresets();
      toast.success('Preset saved');
      return true;
    },
  });
}

function applyPreset(preset) {
  const currentInputs = cloneDeep(props.data.inputs);
  for (const currentInput of currentInputs) {
    const presetInput = preset.inputs.find((p) => p.name === currentInput.name);
    if (presetInput) {
      currentInput.value = presetInput.value;
    }
  }
  updateData({ inputs: currentInputs });
  toast.success(`Preset "${preset.name}" loaded`);
}

function deletePreset(presetId) {
  dialog.confirm({
    title: 'Delete Preset',
    body: 'Are you sure you want to delete this preset?',
    okText: 'Delete',
    okVariant: 'danger',
    onConfirm: async () => {
      const storage = await browser.storage.local.get('aiWorkflowPresets');
      const allPresets = storage.aiWorkflowPresets || {};
      const token = aiPowerToken.value;
      const tokenPresets = allPresets[token] || [];
      allPresets[token] = tokenPresets.filter((p) => p.id !== presetId);
      await browser.storage.local.set({ aiWorkflowPresets: allPresets });
      await loadPresets();
    },
  });
}

watch(
  () => props.data.flowUuid,
  (newVal, oldVal) => {
    if (!newVal) {
      updateData({
        inputs: [],
        outputs: [],
      });
      return;
    }

    if (newVal === oldVal) return;

    const cacheKey = `${aiPowerToken.value}::${newVal}`;
    const cached = flowDetailCache.get(cacheKey);
    if (cached) {
      updateData({
        inputs: cloneDeep(cached.inputs),
        outputs: cloneDeep(cached.outputs),
      });
      loadPresets();
      return;
    }

    getAPWorkflowDetail(newVal, aiPowerToken.value).then((res) => {
      if (res.success) {
        flowDetailCache.set(cacheKey, {
          inputs: cloneDeep(res.data.inputs),
          outputs: cloneDeep(res.data.outputs),
        });
        updateData({
          inputs: res.data.inputs,
          outputs: res.data.outputs,
        });
        loadPresets();
      } else {
        clearInputsAndOutputs();
        toast.error(`Failed to fetch AI Power workflow detail: ${res.msg}`);
      }
    });
  }
);

if (props.data.flowUuid && aiPowerToken.value) {
  loadPresets();
}
</script>
