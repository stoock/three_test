package com.jpalab.domain;

import jakarta.persistence.*;

@Entity
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "order_item_seq")
    @SequenceGenerator(name = "order_item_seq", sequenceName = "order_item_seq", allocationSize = 1)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private Order order;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;

    private int orderPrice;

    private int count;

    protected OrderItem() {
    }

    public OrderItem(Product product, int orderPrice, int count) {
        this.product = product;
        this.orderPrice = orderPrice;
        this.count = count;
    }

    public Long getId() {
        return id;
    }

    public Order getOrder() {
        return order;
    }

    void setOrder(Order order) {
        this.order = order;
    }

    public Product getProduct() {
        return product;
    }

    public int getOrderPrice() {
        return orderPrice;
    }

    public int getCount() {
        return count;
    }

    @Override
    public String toString() {
        return "OrderItem{id=" + id + ", orderPrice=" + orderPrice + ", count=" + count + "}";
    }
}
