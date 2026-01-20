import { ref } from 'vue';

export function useGroupOperations() {
  const groupMembers = ref([]);

  const setGroupMembers = (members: any[]) => {
    groupMembers.value = [...members];
  };

  return {
    groupMembers,
    setGroupMembers
  };
}
