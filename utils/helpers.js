export const objToArray = (obj) => {
  if (!obj) return [];
  return Object.keys(obj)
    .map(key => ({ id: key, ...obj[key] }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
};

export const orderToClient = (order) => {
  if (!order) return order;
  
  if (order.orderItems) {
    order.items = order.orderItems.map(item => ({
      product: item.product || "",
      name: item.name,
      qty: item.qty,
      image: item.image,
      price: item.price,
      size: item.size,
      color: item.color?.name || (typeof item.color === 'string' ? item.color : undefined)
    }));
  } else {
    order.items = [];
  }
  return order;
};
