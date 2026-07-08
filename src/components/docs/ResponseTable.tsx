import type { ReactNode } from 'react';

interface ResponseField {
  name: string;
  type: string;
  description: string | ReactNode;
}

interface ResponseTableProps {
  fields: ResponseField[];
}

export function ResponseTable({ fields }: ResponseTableProps) {
  return (
    <div>
      <h4 className="mb-3 font-medium">Response</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 pr-4 text-left font-medium">Field</th>
              <th className="py-2 pr-4 text-left font-medium">Type</th>
              <th className="py-2 text-left font-medium">Description</th>
            </tr>
          </thead>
          <tbody className="text-muted-foreground">
            {fields.map((field, idx) => (
              <tr key={field.name} className={idx === fields.length - 1 ? '' : 'border-b'}>
                <td className="py-2 pr-4 font-mono text-xs">{field.name}</td>
                <td className="py-2 pr-4">{field.type}</td>
                <td className="py-2">{field.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
