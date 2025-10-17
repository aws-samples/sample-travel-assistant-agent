FROM public.ecr.aws/lambda/python:3.12

# Create and set permissions for /tmp directory
RUN mkdir -p /tmp && chmod 777 /tmp

# Install dependencies
COPY requirements.txt .
RUN python3 -m pip install --upgrade pip --no-cache-dir
RUN pip3 install -r requirements.txt --target "${LAMBDA_TASK_ROOT}" --no-cache-dir

# Copy application code
COPY *.py ${LAMBDA_TASK_ROOT}/

# Copy data directory
COPY data/ ${LAMBDA_TASK_ROOT}/data/

# Install system dependencies for PAAPI SDK (always install to avoid runtime issues)
RUN microdnf install -y unzip && \
    mkdir -p /tmp/paapi && \
    echo "Installing PAAPI SDK dependencies" && \
    microdnf clean all

# Always copy and install PAAPI SDK (will be conditionally used at runtime)
COPY paapi5-python-sdk/paapi5-python-sdk-example.zip /tmp/paapi/
RUN cd /tmp/paapi && \
    unzip -q paapi5-python-sdk-example.zip && \
    cd paapi5-python-sdk-example && \
    pip install . --target "${LAMBDA_TASK_ROOT}" --no-cache-dir && \
    cd / && \
    rm -rf /tmp/paapi

# Replace the ThreadPool line with a None assignment (always apply)
RUN sed -i 's/self\.pool = ThreadPool()/self.pool = None  # Disabled for Lambda/' \
    ${LAMBDA_TASK_ROOT}/paapi5_python_sdk/api_client.py

ENV TRANSFORMERS_CACHE=/tmp

# Set ownership of Lambda task root
RUN chown -R 1000:1000 ${LAMBDA_TASK_ROOT}

# Switch to Lambda user
USER 1000

CMD ["handler.handler"]
