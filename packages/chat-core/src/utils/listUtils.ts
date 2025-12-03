import { IContactProps } from '../components/interfaces/interfaces';

/**
 * Updates a list of items with new values, merging existing items with new ones
 * @param existingList - The current list of items
 * @param newItems - The new items to update with
 * @returns Updated and sorted list
 */
export const updateItemList = <T extends IContactProps>(
  existingList: T[],
  newItems: T[]
): T[] => {
  const itemMap = new Map(existingList.map(item => [item.id, item]));

  newItems.forEach(item => {
    itemMap.set(item.id, { ...itemMap.get(item.id), ...item });
  });

  return Array.from(itemMap.values()).sort((a, b) => {
    if (a.isPin && !b.isPin) return -1;
    if (!a.isPin && b.isPin) return 1;

    return b.latestMessageTime - a.latestMessageTime;
  });
};

/**
 * Creates a sorted list by applying manipulate function and sorting
 * @param items - The raw items to process
 * @param manipulateFn - Function to transform raw items to IContactProps
 * @returns Sorted list of processed items
 */
export const createSortedList = <T>(
  items: T[],
  manipulateFn: (items: T[]) => IContactProps[]
): IContactProps[] => {
  const processedItems = manipulateFn(items);
  return processedItems.sort((a, b) => {
    if (a.isPin && !b.isPin) return -1;
    if (!a.isPin && b.isPin) return 1;

    return b.latestMessageTime - a.latestMessageTime;
  });
};