export default function ProductTable({ products = [] }) {
  // TODO: table columns - image, name, price, stock, edit/delete actions
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="py-2">Name</th>
          <th className="py-2">Price</th>
          <th className="py-2">Stock</th>
          <th className="py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) => (
          <tr key={p._id} className="border-b border-gray-100">
            <td className="py-2">{p.name}</td>
            <td className="py-2">{p.price}</td>
            <td className="py-2">{p.stock}</td>
            <td className="py-2">{/* TODO: edit/delete buttons */}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
