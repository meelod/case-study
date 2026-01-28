import React from "react";
import { marked } from "marked";
import ProductCard from "../ProductCard";
import ProductDivider from "./ProductDivider";

interface MessageContentProps {
    content: string;
    messageIndex: number;
    isUser: boolean;
    productData: Map<number, any>;
}

const MessageContent: React.FC<MessageContentProps> = ({
    content,
    messageIndex,
    isUser,
    productData,
}) => {
    if (isUser || !productData.has(messageIndex)) {
        // For user messages or messages without products, render normally
        return (
            <div
                className={`max-w-none ${isUser ? "text-white" : "text-gray-800"}`}
                style={{ lineHeight: "1.5" }}
                dangerouslySetInnerHTML={{
                    __html: marked(content).replace(/<p>|<\/p>/g, ""),
                }}
            />
        );
    }

    const products =
        productData.get(messageIndex)?.filter((p: any) => p && p.partNumber && p.url) || [];
    if (products.length === 0) {
        return (
            <div
                className="max-w-none text-gray-800"
                style={{ lineHeight: "1.5" }}
                dangerouslySetInnerHTML={{
                    __html: marked(content).replace(/<p>|<\/p>/g, ""),
                }}
            />
        );
    }

    // Create a map of part numbers to products for quick lookup
    const productMap = new Map<string, any>();
    products.forEach((p: any) => {
        productMap.set(p.partNumber.toUpperCase(), p);
    });

    // Find part numbers in the original text (before markdown conversion)
    // Deduplicate: only keep first occurrence of each part number
    const partNumberRegex = /(PS\d{5,10})/gi;
    const seenPartNumbers = new Set<string>();
    const matches: Array<{ partNumber: string; index: number }> = [];
    let match;
    while ((match = partNumberRegex.exec(content)) !== null) {
        const partNumber = match[1].toUpperCase();
        // Only add if we haven't seen this part number before AND we have product data for it
        if (!seenPartNumbers.has(partNumber) && productMap.has(partNumber)) {
            matches.push({
                partNumber: partNumber,
                index: match.index,
            });
            seenPartNumbers.add(partNumber);
        }
    }

    // If no part numbers found, render normally
    if (matches.length === 0) {
        return (
            <div
                className="max-w-none text-gray-800"
                style={{ lineHeight: "1.5" }}
                dangerouslySetInnerHTML={{
                    __html: marked(content).replace(/<p>|<\/p>/g, ""),
                }}
            />
        );
    }

    // Sort matches by index to process in order
    matches.sort((a, b) => a.index - b.index);

    // Split content into segments at part number positions
    // Include the part number in the text, then show ProductCard after it
    const segments: Array<{
        type: "text" | "product";
        content?: string;
        partNumber?: string;
    }> = [];
    let lastIndex = 0;

    matches.forEach((m) => {
        // Add text including this part number (up to and including the part number)
        if (m.index >= lastIndex) {
            const textEndIndex = m.index + m.partNumber.length;
            const textSegment = content.substring(lastIndex, textEndIndex);
            if (textSegment.trim()) {
                segments.push({ type: "text", content: textSegment });
            }
        }

        // Add product card right after the part number
        segments.push({ type: "product", partNumber: m.partNumber });

        lastIndex = m.index + m.partNumber.length;
    });

    // Add remaining text after last part number
    if (lastIndex < content.length) {
        const remainingText = content.substring(lastIndex);
        if (remainingText.trim()) {
            segments.push({ type: "text", content: remainingText });
        }
    }

    // Track product count to add dividers between all products
    let productCount = 0;

    // Render segments - convert text segments to markdown, insert product cards
    return (
        <div className="max-w-none text-gray-800" style={{ lineHeight: "1.5" }}>
            {segments.map((segment, idx) => {
                if (segment.type === "product" && segment.partNumber) {
                    const product = productMap.get(segment.partNumber);
                    if (product) {
                        productCount++;
                        const isFirstProduct = productCount === 1;

                        return (
                            <React.Fragment key={`product-wrapper-${idx}`}>
                                {!isFirstProduct && <ProductDivider />}
                                <div key={`product-${idx}`} className={isFirstProduct ? "mt-2.5" : ""}>
                                    <ProductCard
                                        partNumber={product.partNumber}
                                        name={product.name || product.partNumber}
                                        url={product.url}
                                        description={product.description}
                                    />
                                </div>
                            </React.Fragment>
                        );
                    }
                }
                // Render text segment with markdown conversion
                if (segment.content) {
                    return (
                        <span
                            key={`text-${idx}`}
                            dangerouslySetInnerHTML={{
                                __html: marked(segment.content).replace(/<p>|<\/p>/g, ""),
                            }}
                        />
                    );
                }
                return null;
            })}
        </div>
    );
};

export default MessageContent;
