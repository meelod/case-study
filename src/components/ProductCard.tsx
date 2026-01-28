import React, { useMemo, useState } from "react";
import { ProductCardProps } from "../types/product/ProductComponents";
import { getProductImageUrl } from "../utils/productExtractor";

const ProductCard: React.FC<ProductCardProps> = ({ partNumber, name, url, description, imageUrl: propImageUrl }) => {
    // Use provided imageUrl or fallback to constructed URL
    const imageUrl = propImageUrl || getProductImageUrl(partNumber);
    const [imageFailed, setImageFailed] = useState(false);

    // Debug logging
    React.useEffect(() => {
        if (propImageUrl) {
            console.log(`ProductCard ${partNumber}: Using provided imageUrl: ${propImageUrl}`);
        } else {
            console.log(`ProductCard ${partNumber}: Using fallback constructed URL: ${imageUrl}`);
        }
    }, [partNumber, propImageUrl, imageUrl]);

    const fallbackSvgDataUri = useMemo(() => {
        const svg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="#f3f4f6"/>
  <path d="M26 62h44" stroke="#9ca3af" stroke-width="4" stroke-linecap="round"/>
  <path d="M32 44h32" stroke="#9ca3af" stroke-width="4" stroke-linecap="round"/>
  <circle cx="48" cy="34" r="10" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/>
  <text x="48" y="84" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="10" fill="#6b7280">No image</text>
</svg>`);
        return `data:image/svg+xml;charset=utf-8,${svg}`;
    }, []);

    return (
        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
            <div className="flex">
                <div className="w-24 h-24 flex-shrink-0 bg-gray-100 flex items-center justify-center">
                    <img
                        src={imageFailed ? fallbackSvgDataUri : imageUrl}
                        alt={name}
                        className="w-full h-full object-contain"
                        onError={(e) => {
                            // Avoid external placeholder calls (some environments block DNS/network)
                            // and avoid infinite onError loops by switching state once.
                            if (!imageFailed) {
                                console.warn(`Image failed to load for ${partNumber}:`, imageUrl);
                                setImageFailed(true);
                            }
                        }}
                        onLoad={() => {
                            console.log(`Image loaded successfully for ${partNumber}:`, imageUrl);
                        }}
                    />
                </div>
                <div className="flex-1 p-3">
                    <div className="font-semibold text-sm text-gray-900">{name}</div>
                    <div className="text-xs text-teal-600 font-medium mt-1">Part #: {partNumber}</div>
                    {description && (
                        <div className="text-xs text-gray-600 mt-1 line-clamp-2">{description}</div>
                    )}
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-xs text-teal-600 hover:text-teal-700 font-medium underline"
                    >
                        View on PartSelect →
                    </a>
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
