export default function CartItem({ item }) {
  // TODO: item.image, item.name, item.price, quantity +/- control, remove button
  return (
    <div className="flex items-center justify-between border-b border-gray-200 py-4">
      <div>
        <p className="font-medium">{item?.name}</p>
        <p className="text-sm text-primary-light">Qty: {item?.quantity}</p>
      </div>
      <p>{item?.price} ৳</p>
      {/* TODO: remove button - useCartStore().removeItem(item.id) */}
    </div>
  );
}
