import React from "react";
import { ProductDividerProps } from "../../types/product/ProductComponents";

const ProductDivider: React.FC<ProductDividerProps> = ({ label = "OR" }) => {
    return (
        <div className="my-4 flex items-center">
            <div className="flex-1 border-t border-gray-300"></div>
            <div className="px-3 text-xs text-gray-400 font-medium">{label}</div>
            <div className="flex-1 border-t border-gray-300"></div>
        </div>
    );
};

export default ProductDivider;
