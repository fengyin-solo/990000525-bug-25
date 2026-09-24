<template>
  <el-dialog
    :model-value="visible"
    title="Add New Card"
    width="480px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
    @open="resetForm"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="Title" prop="title">
        <el-input v-model="form.title" placeholder="Enter card title" maxlength="100" show-word-limit />
      </el-form-item>

      <el-form-item label="Description" prop="description">
        <el-input v-model="form.description" type="textarea" :rows="3" placeholder="Enter card description (optional)" maxlength="500" show-word-limit />
      </el-form-item>

      <div style="display: flex; gap: 16px;">
        <el-form-item label="Priority" prop="priority" style="flex: 1;">
          <el-select v-model="form.priority" style="width: 100%;">
            <el-option label="Low" value="low" />
            <el-option label="Medium" value="medium" />
            <el-option label="High" value="high" />
          </el-select>
        </el-form-item>

        <el-form-item label="Due Date" prop="due_date" style="flex: 1;">
          <el-date-picker
            v-model="form.due_date"
            type="date"
            placeholder="Select date"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%;"
          />
          <div v-if="dueDateError" class="field-error">{{ dueDateError }}</div>
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">Cancel</el-button>
      <el-button type="primary" :loading="adding" @click="handleAdd">Add Card</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useBoardStore } from '../stores/board.js'
import { isValidDueDate } from '../utils/date.js'

const props = defineProps({
  visible: Boolean,
  columnId: { type: Number, default: null }
})

const emit = defineEmits(['update:visible', 'added'])

const boardStore = useBoardStore()
const formRef = ref(null)
const adding = ref(false)

const form = ref({
  title: '',
  description: '',
  priority: 'medium',
  due_date: ''
})

const dueDateError = ref('')

const dueDateReadyToSave = computed(() =>
  form.value.due_date === '' || isValidDueDate(form.value.due_date)
)

watch(() => form.value.due_date, () => {
  dueDateError.value = dueDateReadyToSave.value
    ? ''
    : 'Please enter a valid date (YYYY-MM-DD) or leave it empty'
})

const rules = {
  title: [{ required: true, message: 'Card title is required', trigger: 'blur' }]
}

function resetForm() {
  form.value = {
    title: '',
    description: '',
    priority: 'medium',
    due_date: ''
  }
  dueDateError.value = ''
}

async function handleAdd() {
  if (!formRef.value) return
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  // Never submit a half-finished date; only '' (no date) or a real date pass.
  if (!dueDateReadyToSave.value) {
    dueDateError.value = 'Please enter a valid date (YYYY-MM-DD) or leave it empty'
    return
  }

  adding.value = true
  try {
    await boardStore.addCard(props.columnId, {
      title: form.value.title,
      description: form.value.description,
      priority: form.value.priority,
      due_date: form.value.due_date || null
    })
    ElMessage.success('Card added!')
    emit('update:visible', false)
    emit('added')
  } catch (err) {
    ElMessage.error(err.response?.data?.error || 'Failed to add card')
  } finally {
    adding.value = false
  }
}
</script>

<style scoped>
.field-error {
  color: #f56c6c;
  font-size: 12px;
  line-height: 1.4;
  margin-top: 4px;
}
</style>
